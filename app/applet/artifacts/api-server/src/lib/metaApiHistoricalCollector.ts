import { logger } from "./logger.js";
import { getSystemSettings } from "@workspace/db";
import {
  upsertCandles,
  getHistoricalDataStats,
  type StoredCandle,
} from "./historicalDataManager.js";

export interface SyncProgress {
  status: "IDLE" | "SYNCING" | "COMPLETED" | "CANCELLED" | "ERROR";
  symbol: string;
  timeframe: string;
  targetMonths: number;
  candlesDownloaded: number;
  candlesInserted: number;
  batchesCompleted: number;
  totalBatchesEstimated: number;
  percent: number;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  currentDateRange: string | null;
}

let activeSyncProgress: SyncProgress = {
  status: "IDLE",
  symbol: "GOLD",
  timeframe: "5m",
  targetMonths: 6,
  candlesDownloaded: 0,
  candlesInserted: 0,
  batchesCompleted: 0,
  totalBatchesEstimated: 0,
  percent: 0,
  startedAt: null,
  completedAt: null,
  lastError: null,
  currentDateRange: null,
};

let syncAbortRequested = false;

export function getCollectorStatus(): SyncProgress {
  return { ...activeSyncProgress };
}

export function cancelHistoricalSync(): void {
  syncAbortRequested = true;
  activeSyncProgress.status = "CANCELLED";
  activeSyncProgress.lastError = "Sync cancelled by user";
  logger.info("[HistoricalCollector] User requested sync cancellation");
}

/**
 * Discover the exact Gold symbol supported by the connected MT5 account
 */
export async function discoverBrokerGoldSymbol(accountId: string): Promise<string> {
  const settings = await getSystemSettings().catch(() => ({} as any));
  const configured = settings?.metaApiSymbol?.trim();
  if (configured && configured !== "GOLD") {
    return configured;
  }

  const token = process.env.META_API_TOKEN;
  if (!token || !accountId) return configured || "GOLD";

  try {
    const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
    const metaApi = new MetaApi(token, { requestTimeout: 30, connectTimeout: 30 });
    const account = await metaApi.metatraderAccountApi.getAccount(accountId);

    if (account.state === "DEPLOYED") {
      const candidates = ["GOLD", "XAUUSD", "XAUUSDm", "XAUUSD.a", "XAUUSD_i", "GOLD.m"];
      for (const sym of candidates) {
        try {
          const spec = await account.getSymbolSpecification(sym);
          if (spec) {
            logger.info({ sym, accountId }, "[HistoricalCollector] Discovered broker symbol");
            return sym;
          }
        } catch {}
      }
    }
  } catch (err: any) {
    logger.debug({ err: err?.message }, "[HistoricalCollector] Symbol discovery fallback to default");
  }

  return configured || "GOLD";
}

/**
 * Run paginated historical download from MetaApi Cloud SDK
 */
export async function runHistoricalDataSync(params: {
  accountId: string;
  symbol?: string;
  timeframe: string; // "1m" | "5m" | "15m"
  months?: number; // default: 6 months
}): Promise<SyncProgress> {
  if (activeSyncProgress.status === "SYNCING") {
    throw new Error("A historical synchronization is already in progress.");
  }

  syncAbortRequested = false;
  const token = process.env.META_API_TOKEN;
  if (!token) {
    throw new Error("META_API_TOKEN is not configured in server environment.");
  }

  const accountId = params.accountId.trim();
  if (!accountId) {
    throw new Error("A valid MetaApi account ID is required for historical download.");
  }

  const tf = params.timeframe || "5m";
  const months = Math.min(Math.max(params.months || 6, 1), 24);
  const symbol = params.symbol || (await discoverBrokerGoldSymbol(accountId));

  // Calculate time bounds in UTC
  const now = Date.now();
  const startTime = now - months * 30 * 24 * 3600 * 1000;

  // Estimate total batches (MetaApi limit = 1000 candles/batch)
  const tfMinutes: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "1d": 1440 };
  const stepMins = tfMinutes[tf] || 5;
  const estimatedTotalCandles = Math.floor((months * 30 * 24 * 60 * 0.72) / stepMins); // ~72% trading hours accounting for weekends
  const estimatedBatches = Math.max(1, Math.ceil(estimatedTotalCandles / 950));

  activeSyncProgress = {
    status: "SYNCING",
    symbol,
    timeframe: tf,
    targetMonths: months,
    candlesDownloaded: 0,
    candlesInserted: 0,
    batchesCompleted: 0,
    totalBatchesEstimated: estimatedBatches,
    percent: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    lastError: null,
    currentDateRange: `${new Date(startTime).toISOString().split("T")[0]} to ${new Date(now).toISOString().split("T")[0]}`,
  };

  logger.info(
    { symbol, tf, months, estimatedBatches, accountId },
    "[HistoricalCollector] Initiating paginated MetaApi download"
  );

  (async () => {
    try {
      const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
      const metaApi = new MetaApi(token, { requestTimeout: 60, connectTimeout: 60 });
      const account = await metaApi.metatraderAccountApi.getAccount(accountId);

      let currentStartTime = startTime;
      const batchSize = 1000;
      let consecutiveEmptyBatches = 0;

      while (currentStartTime < now && !syncAbortRequested) {
        let candles: any[] = [];
        let retryCount = 0;
        const maxRetries = 4;

        while (retryCount < maxRetries && !syncAbortRequested) {
          try {
            const startDate = new Date(currentStartTime);
            candles = await account.getHistoricalCandles(symbol, tf, startDate, batchSize);
            break;
          } catch (fetchErr: any) {
            retryCount++;
            const backoffMs = Math.pow(2, retryCount) * 800;
            logger.warn(
              { retryCount, backoffMs, err: fetchErr?.message },
              "[HistoricalCollector] Batch fetch failed, backing off..."
            );
            await new Promise((r) => setTimeout(r, backoffMs));
          }
        }

        if (syncAbortRequested) {
          logger.info("[HistoricalCollector] Aborting sync loop per user request");
          break;
        }

        if (!candles || candles.length === 0) {
          consecutiveEmptyBatches++;
          if (consecutiveEmptyBatches >= 3) {
            logger.info("[HistoricalCollector] Reached end of available broker history");
            break;
          }
          // Advance pointer by 2 days if no candles returned (e.g. holiday or weekend)
          currentStartTime += 2 * 24 * 3600 * 1000;
          continue;
        }

        consecutiveEmptyBatches = 0;

        // Transform into StoredCandle schema
        const importTime = new Date().toISOString();
        const storedBatch: StoredCandle[] = candles.map((c: any) => {
          const timeMs =
            typeof c.time === "string"
              ? new Date(c.time).getTime()
              : c.time > 1000000000000
              ? c.time
              : c.time * 1000;

          // Estimate candle spread in points from tick volume & prices or broker default
          const spread = c.spread !== undefined ? Number(c.spread) : 0.45;

          return {
            id: `${accountId}_${symbol}_${tf}_${timeMs}`,
            accountId,
            symbol,
            timeframe: tf,
            timestamp: timeMs,
            timestampUtc: new Date(timeMs).toISOString(),
            brokerTime: c.brokerTime || undefined,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            tickVolume: Number(c.tickVolume || c.volume || 1),
            volume: Number(c.volume || c.tickVolume || 1),
            spread,
            source: "metaapi",
            importedAt: importTime,
            qualityStatus: "VALID",
          };
        });

        // Store into persistent SQLite
        const result = upsertCandles(storedBatch);
        activeSyncProgress.candlesDownloaded += candles.length;
        activeSyncProgress.candlesInserted += result.inserted;
        activeSyncProgress.batchesCompleted += 1;

        // Calculate progress percentage
        const progressPct = Math.min(
          99,
          Math.round(((currentStartTime - startTime) / (now - startTime)) * 100)
        );
        activeSyncProgress.percent = Math.max(activeSyncProgress.percent, progressPct);

        // Advance start time for next batch to the timestamp of the last candle + 1 interval
        const lastCandle = candles[candles.length - 1];
        const lastTimeMs =
          typeof lastCandle.time === "string"
            ? new Date(lastCandle.time).getTime()
            : lastCandle.time > 1000000000000
            ? lastCandle.time
            : lastCandle.time * 1000;

        if (lastTimeMs <= currentStartTime) {
          currentStartTime += stepMins * 60 * 1000 * batchSize;
        } else {
          currentStartTime = lastTimeMs + stepMins * 60 * 1000;
        }

        // Polite rate limit delay between batches to respect broker & MetaApi limits
        await new Promise((r) => setTimeout(r, 400));
      }

      if (!syncAbortRequested) {
        activeSyncProgress.status = "COMPLETED";
        activeSyncProgress.percent = 100;
        activeSyncProgress.completedAt = new Date().toISOString();
        logger.info(
          {
            symbol,
            tf,
            downloaded: activeSyncProgress.candlesDownloaded,
            inserted: activeSyncProgress.candlesInserted,
          },
          "[HistoricalCollector] Historical synchronization successfully completed"
        );
      }
    } catch (err: any) {
      activeSyncProgress.status = "ERROR";
      activeSyncProgress.lastError = err.message || String(err);
      logger.error({ err }, "[HistoricalCollector] Fatal error during historical sync");
    }
  })();

  return activeSyncProgress;
}

/**
 * Manual CSV Importer: parse and validate uploaded OHLC files
 */
export function importHistoricalCsvData(
  csvString: string,
  symbol = "GOLD",
  timeframe = "5m",
  accountId = "MANUAL_IMPORT"
): { totalRows: number; inserted: number; errors: string[] } {
  const lines = csvString.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("CSV file must contain at least a header and one data row");
  }

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(",").map((h) => h.trim().replace(/"/g, ""));

  const timeIdx = headers.findIndex((h) => h.includes("time") || h.includes("date") || h === "timestamp");
  const openIdx = headers.findIndex((h) => h === "open" || h.startsWith("open"));
  const highIdx = headers.findIndex((h) => h === "high" || h.startsWith("high"));
  const lowIdx = headers.findIndex((h) => h === "low" || h.startsWith("low"));
  const closeIdx = headers.findIndex((h) => h === "close" || h.startsWith("close"));
  const volIdx = headers.findIndex((h) => h.includes("vol") || h === "volume" || h === "tick_volume");
  const spreadIdx = headers.findIndex((h) => h.includes("spread"));

  if (timeIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
    throw new Error(
      `CSV header missing required columns. Found: [${headers.join(", ")}]. Required: [Time/Date, Open, High, Low, Close]`
    );
  }

  const candlesToStore: StoredCandle[] = [];
  const errors: string[] = [];
  const importTime = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
    try {
      const rawTime = cols[timeIdx];
      const parsedTime = new Date(rawTime).getTime();
      if (!parsedTime || isNaN(parsedTime)) {
        errors.push(`Row ${i}: Invalid date format "${rawTime}"`);
        continue;
      }

      const open = parseFloat(cols[openIdx]);
      const high = parseFloat(cols[highIdx]);
      const low = parseFloat(cols[lowIdx]);
      const close = parseFloat(cols[closeIdx]);
      const volume = volIdx !== -1 && cols[volIdx] ? parseFloat(cols[volIdx]) : 1;
      const spread = spreadIdx !== -1 && cols[spreadIdx] ? parseFloat(cols[spreadIdx]) : 0.45;

      candlesToStore.push({
        id: `${accountId}_${symbol}_${timeframe}_${parsedTime}`,
        accountId,
        symbol,
        timeframe,
        timestamp: parsedTime,
        timestampUtc: new Date(parsedTime).toISOString(),
        open,
        high,
        low,
        close,
        tickVolume: volume,
        volume,
        spread,
        source: "csv_import",
        importedAt: importTime,
        qualityStatus: "VALID",
      });
    } catch (rowErr: any) {
      errors.push(`Row ${i}: ${rowErr.message || rowErr}`);
    }
  }

  const result = upsertCandles(candlesToStore);
  return {
    totalRows: lines.length - 1,
    inserted: result.inserted + result.updated,
    errors: errors.slice(0, 10),
  };
}
