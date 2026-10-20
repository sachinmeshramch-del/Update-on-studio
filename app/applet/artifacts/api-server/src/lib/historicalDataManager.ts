import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { logger } from "./logger.js";
import type { OHLCCandle } from "./goldPrice.js";

export interface StoredCandle {
  id: string;
  accountId: string;
  symbol: string;
  timeframe: string;
  timestamp: number; // UTC candle open in unix ms
  timestampUtc: string; // ISO 8601 string
  brokerTime?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  volume: number;
  spread: number; // historical spread in broker points
  source: string; // 'metaapi' | 'csv_import'
  importedAt: string;
  qualityStatus: "VALID" | "SUSPICIOUS" | "GAP_FLAGGED";
}

export interface CandleValidationResult {
  valid: boolean;
  reason?: string;
}

export interface DataGap {
  symbol: string;
  timeframe: string;
  fromTime: string;
  toTime: string;
  gapDurationMinutes: number;
  missingCandlesEstimated: number;
  isWeekendGap: boolean;
}

export interface TimeframeCoverage {
  timeframe: string;
  count: number;
  earliest: string | null;
  latest: string | null;
  earliestMs: number;
  latestMs: number;
  gapsCount: number;
  dataQualityValidPct: number;
}

export interface HistoricalDataStats {
  symbol: string;
  accountId: string;
  totalCandles: number;
  dbSizeBytes: number;
  coverage: Record<string, TimeframeCoverage>;
  detectedGaps: DataGap[];
}

const DB_PATH = path.resolve(process.cwd(), "historical_market_data.db");

let dbInstance: DatabaseSync | null = null;

export function getHistoricalDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA synchronous = NORMAL;");
    dbInstance.exec("PRAGMA cache_size = -64000;"); // 64MB cache

    // Initialize Schema
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS historical_candles (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        timestamp_utc TEXT NOT NULL,
        broker_time TEXT,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        tick_volume REAL NOT NULL,
        volume REAL NOT NULL,
        spread REAL NOT NULL,
        source TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        quality_status TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_upsert 
        ON historical_candles(account_id, symbol, timeframe, timestamp);

      CREATE INDEX IF NOT EXISTS idx_candles_query 
        ON historical_candles(symbol, timeframe, timestamp ASC);

      CREATE TABLE IF NOT EXISTS backtest_runs (
        id TEXT PRIMARY KEY,
        strategy_name TEXT NOT NULL,
        strategy_version TEXT NOT NULL,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        candle_count INTEGER NOT NULL,
        initial_balance REAL NOT NULL,
        config_snapshot TEXT NOT NULL,
        cost_assumptions TEXT NOT NULL,
        summary_metrics TEXT NOT NULL,
        trades_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runs_created 
        ON backtest_runs(created_at DESC);
    `);

    logger.info({ dbPath: DB_PATH }, "[HistoricalDataManager] SQLite Database initialized with WAL mode");
  }
  return dbInstance;
}

/**
 * Validate candle data integrity according to strict quantitative rules:
 * - All OHLC values must be finite and positive.
 * - High >= max(open, close, low).
 * - Low <= min(open, close, high).
 * - Not an incomplete forming candle.
 */
export function validateCandle(
  candle: { open: number; high: number; low: number; close: number; timestamp: number },
  timeframeMinutes = 5
): CandleValidationResult {
  const { open, high, low, close, timestamp } = candle;

  if (
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0
  ) {
    return { valid: false, reason: "OHLC values must be finite positive numbers" };
  }

  if (high < Math.max(open, close, low) - 0.0001) {
    return { valid: false, reason: `High (${high}) cannot be lower than open, close or low` };
  }

  if (low > Math.min(open, close, high) + 0.0001) {
    return { valid: false, reason: `Low (${low}) cannot be higher than open, close or high` };
  }

  // Reject future/incomplete candles (current candle still forming)
  const now = Date.now();
  const barIntervalMs = timeframeMinutes * 60 * 1000;
  if (timestamp + barIntervalMs > now + 30_000) {
    return { valid: false, reason: "Incomplete candle still forming; only closed bars allowed" };
  }

  return { valid: true };
}

/**
 * Batch insert or upsert candles atomically inside a single SQLite transaction
 */
export function upsertCandles(candles: StoredCandle[]): { inserted: number; updated: number; invalid: number } {
  if (candles.length === 0) return { inserted: 0, updated: 0, invalid: 0 };

  const db = getHistoricalDb();
  let inserted = 0;
  let updated = 0;
  let invalid = 0;

  const checkStmt = db.prepare(
    "SELECT id FROM historical_candles WHERE account_id = ? AND symbol = ? AND timeframe = ? AND timestamp = ?"
  );

  const insertStmt = db.prepare(`
    INSERT INTO historical_candles (
      id, account_id, symbol, timeframe, timestamp, timestamp_utc,
      broker_time, open, high, low, close, tick_volume, volume,
      spread, source, imported_at, quality_status
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(account_id, symbol, timeframe, timestamp) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      tick_volume = excluded.tick_volume,
      volume = excluded.volume,
      spread = excluded.spread,
      imported_at = excluded.imported_at,
      quality_status = excluded.quality_status
  `);

  db.exec("BEGIN TRANSACTION;");
  try {
    for (const c of candles) {
      const val = validateCandle(c);
      if (!val.valid) {
        invalid++;
        continue;
      }

      const existing = checkStmt.get(c.accountId, c.symbol, c.timeframe, c.timestamp);
      if (existing) {
        updated++;
      } else {
        inserted++;
      }

      insertStmt.run(
        c.id,
        c.accountId,
        c.symbol,
        c.timeframe,
        c.timestamp,
        c.timestampUtc,
        c.brokerTime || null,
        c.open,
        c.high,
        c.low,
        c.close,
        c.tickVolume,
        c.volume,
        c.spread,
        c.source,
        c.importedAt,
        c.qualityStatus
      );
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    logger.error({ err }, "[HistoricalDataManager] Batch upsert transaction rolled back");
    throw err;
  }

  return { inserted, updated, invalid };
}

/**
 * Fetch chronological candles for backtesting or chart replay
 */
export function queryHistoricalCandles(params: {
  symbol: string;
  timeframe: string;
  startTime?: number; // unix ms
  endTime?: number; // unix ms
  limit?: number;
}): StoredCandle[] {
  const db = getHistoricalDb();
  const { symbol, timeframe, startTime = 0, endTime = Date.now(), limit = 10000 } = params;

  const stmt = db.prepare(`
    SELECT * FROM historical_candles
    WHERE symbol = ? AND timeframe = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
    LIMIT ?
  `);

  const rows = stmt.all(symbol, timeframe, startTime, endTime, limit) as any[];

  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    timestamp: r.timestamp,
    timestampUtc: r.timestamp_utc,
    brokerTime: r.broker_time,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    tickVolume: r.tick_volume,
    volume: r.volume,
    spread: r.spread,
    source: r.source,
    importedAt: r.imported_at,
    qualityStatus: r.quality_status,
  }));
}

/**
 * Convert stored candles into lightweight OHLCCandle format for indicators & backtest engine
 */
export function queryAsOHLCCandles(params: {
  symbol: string;
  timeframe: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): (OHLCCandle & { spread: number; timestampMs: number })[] {
  const stored = queryHistoricalCandles(params);
  return stored.map((s) => ({
    time: Math.floor(s.timestamp / 1000), // unix seconds for legacy indicators
    timestampMs: s.timestamp,
    open: s.open,
    high: s.high,
    low: s.low,
    close: s.close,
    volume: s.volume || s.tickVolume || 1,
    spread: s.spread,
  }));
}

/**
 * Detect chronological data gaps, differentiating normal weekend market closures from genuine data drops
 */
export function detectHistoricalGaps(symbol: string, timeframe: string): DataGap[] {
  const db = getHistoricalDb();
  const stmt = db.prepare(`
    SELECT timestamp, timestamp_utc FROM historical_candles
    WHERE symbol = ? AND timeframe = ?
    ORDER BY timestamp ASC
  `);

  const rows = stmt.all(symbol, timeframe) as { timestamp: number; timestamp_utc: string }[];
  if (rows.length < 2) return [];

  const tfMinutes: Record<string, number> = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "1d": 1440,
  };
  const stepMinutes = tfMinutes[timeframe] || 5;
  const expectedStepMs = stepMinutes * 60 * 1000;
  const gapThresholdMs = expectedStepMs * 2.5; // Gap flagged if > 2.5 missed intervals

  const gaps: DataGap[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const currTime = rows[i].timestamp;
    const nextTime = rows[i + 1].timestamp;
    const diffMs = nextTime - currTime;

    if (diffMs > gapThresholdMs) {
      const currDate = new Date(currTime);
      const nextDate = new Date(nextTime);
      const dayOfWeek = currDate.getUTCDay(); // 5 = Friday, 6 = Saturday, 0 = Sunday

      // Check if the gap aligns with Friday market close (21:00 UTC) to Sunday market open (21:00 UTC)
      const isWeekend =
        (dayOfWeek === 5 && currDate.getUTCHours() >= 20) ||
        dayOfWeek === 6 ||
        (dayOfWeek === 0 && nextDate.getUTCDay() === 0 && nextDate.getUTCHours() <= 22);

      const gapMins = Math.round(diffMs / 60000);
      const missingCount = Math.floor(diffMs / expectedStepMs) - 1;

      gaps.push({
        symbol,
        timeframe,
        fromTime: rows[i].timestamp_utc,
        toTime: rows[i + 1].timestamp_utc,
        gapDurationMinutes: gapMins,
        missingCandlesEstimated: missingCount,
        isWeekendGap: isWeekend,
      });
    }
  }

  return gaps;
}

/**
 * Get comprehensive storage metrics and coverage across all stored timeframes
 */
export function getHistoricalDataStats(symbol: string, accountId: string): HistoricalDataStats {
  const db = getHistoricalDb();
  const timeframes = ["1m", "5m", "15m", "1h", "1d"];
  const coverage: Record<string, TimeframeCoverage> = {};
  let totalCandles = 0;
  const allGaps: DataGap[] = [];

  for (const tf of timeframes) {
    const row = db
      .prepare(
        `SELECT 
          COUNT(*) as cnt, 
          MIN(timestamp) as min_ts, 
          MAX(timestamp) as max_ts,
          SUM(CASE WHEN quality_status = 'VALID' THEN 1 ELSE 0 END) as valid_cnt
        FROM historical_candles 
        WHERE symbol = ? AND timeframe = ?`
      )
      .get(symbol, tf) as any;

    const count = Number(row?.cnt || 0);
    totalCandles += count;

    const earliestMs = Number(row?.min_ts || 0);
    const latestMs = Number(row?.max_ts || 0);
    const validCount = Number(row?.valid_cnt || 0);

    const tfGaps = count > 10 ? detectHistoricalGaps(symbol, tf).filter((g) => !g.isWeekendGap) : [];
    if (tfGaps.length > 0) {
      allGaps.push(...tfGaps.slice(0, 10));
    }

    coverage[tf] = {
      timeframe: tf,
      count,
      earliest: earliestMs > 0 ? new Date(earliestMs).toISOString() : null,
      latest: latestMs > 0 ? new Date(latestMs).toISOString() : null,
      earliestMs,
      latestMs,
      gapsCount: tfGaps.length,
      dataQualityValidPct: count > 0 ? Number(((validCount / count) * 100).toFixed(1)) : 100,
    };
  }

  let dbSizeBytes = 0;
  try {
    if (fs.existsSync(DB_PATH)) {
      dbSizeBytes = fs.statSync(DB_PATH).size;
    }
  } catch {}

  return {
    symbol,
    accountId,
    totalCandles,
    dbSizeBytes,
    coverage,
    detectedGaps: allGaps.slice(0, 20),
  };
}

/**
 * Save an immutable backtest run result
 */
export function saveBacktestRun(run: {
  id: string;
  strategyName: string;
  strategyVersion: string;
  symbol: string;
  timeframe: string;
  startTime: string;
  endTime: string;
  candleCount: number;
  initialBalance: number;
  configSnapshot: any;
  costAssumptions: any;
  summaryMetrics: any;
  tradesCount: number;
}): void {
  const db = getHistoricalDb();
  const stmt = db.prepare(`
    INSERT INTO backtest_runs (
      id, strategy_name, strategy_version, symbol, timeframe,
      start_time, end_time, candle_count, initial_balance,
      config_snapshot, cost_assumptions, summary_metrics,
      trades_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    run.id,
    run.strategyName,
    run.strategyVersion,
    run.symbol,
    run.timeframe,
    run.startTime,
    run.endTime,
    run.candleCount,
    run.initialBalance,
    JSON.stringify(run.configSnapshot),
    JSON.stringify(run.costAssumptions),
    JSON.stringify(run.summaryMetrics),
    run.tradesCount,
    new Date().toISOString()
  );
}

/**
 * List all saved backtest runs
 */
export function listBacktestRuns(limit = 50): any[] {
  const db = getHistoricalDb();
  const rows = db
    .prepare("SELECT * FROM backtest_runs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as any[];

  return rows.map((r) => ({
    id: r.id,
    strategyName: r.strategy_name,
    strategyVersion: r.strategy_version,
    symbol: r.symbol,
    timeframe: r.timeframe,
    startTime: r.start_time,
    endTime: r.end_time,
    candleCount: r.candle_count,
    initialBalance: r.initial_balance,
    configSnapshot: JSON.parse(r.config_snapshot || "{}"),
    costAssumptions: JSON.parse(r.cost_assumptions || "{}"),
    summaryMetrics: JSON.parse(r.summary_metrics || "{}"),
    tradesCount: r.trades_count,
    createdAt: r.created_at,
  }));
}
