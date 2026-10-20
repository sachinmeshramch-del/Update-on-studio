import fs from "fs";
import path from "path";
import { logger } from "./logger.js";
import type { OHLCCandle } from "./goldPrice.js";
import { getSystemSettings } from "@workspace/db";

export interface StoredCandle {
  accountRef: string;
  symbol: string;
  timeframe: string; // "1m" | "5m" | "15m" | "1h"
  timestampUTC: number; // Canonical Unix timestamp in SECONDS
  isoUTC: string;
  brokerTimestamp?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  volume: number;
  spreadPoints: number;
  dataSource: "MetaApi" | "CSV_IMPORT" | "SYNTHETIC_FALLBACK";
  importTimestamp: number;
  qualityStatus: "VERIFIED" | "GAP_DETECTED" | "SUSPECT_ANOMALY" | "FORMING";
}

export interface HistoricalCoverageSummary {
  accountRef: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  firstCandleUTC: string | null;
  lastCandleUTC: string | null;
  gapCount: number;
  freshnessMinutes: number;
  dataQuality: "EXCELLENT" | "GOOD" | "GAPS_DETECTED" | "EMPTY";
}

export interface ValidationIssue {
  index: number;
  timestampUTC: number;
  type: "NEGATIVE_ZERO" | "HIGH_VIOLATION" | "LOW_VIOLATION" | "OUT_OF_ORDER" | "DUPLICATE" | "GAP";
  message: string;
}

const DATA_DIR = path.resolve(process.cwd(), ".historical_data");

// In-memory cache for ultra-fast query and backtesting lookup
const candleStore = new Map<string, StoredCandle[]>();

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getStoreKey(symbol: string, timeframe: string): string {
  return `${symbol.toUpperCase()}_${timeframe.toLowerCase()}`;
}

function getStoreFilePath(symbol: string, timeframe: string): string {
  ensureDataDir();
  return path.resolve(DATA_DIR, `${getStoreKey(symbol, timeframe)}.json`);
}

/**
 * Expected candle interval in seconds for each standard timeframe
 */
export function getTimeframeSeconds(tf: string): number {
  switch (tf.toLowerCase()) {
    case "1m": return 60;
    case "5m": return 300;
    case "15m": return 900;
    case "30m": return 1800;
    case "1h": return 3600;
    case "4h": return 14400;
    case "1d": return 86400;
    default: return 300;
  }
}

/**
 * Safely converts timestamps (seconds or ms or ISO string) to JavaScript Date
 */
export function toDate(time: number | string | Date): Date {
  if (time instanceof Date) return time;
  if (typeof time === "string") return new Date(time);
  if (typeof time === "number") {
    const ms = time > 100000000000 ? time : time * 1000;
    return new Date(ms);
  }
  return new Date();
}

/**
 * Normalizes input time to canonical Unix seconds
 */
export function normalizeToUnixSeconds(time: string | number | Date): number {
  if (typeof time === "number") {
    return time > 100000000000 ? Math.floor(time / 1000) : Math.floor(time);
  }
  if (time instanceof Date) {
    return Math.floor(time.getTime() / 1000);
  }
  const parsed = new Date(time).getTime();
  return Math.floor(parsed / 1000);
}

/**
 * Loads stored candles from disk into memory
 */
export function loadStoredCandles(symbol = "XAUUSD", timeframe = "5m"): StoredCandle[] {
  const key = getStoreKey(symbol, timeframe);
  if (candleStore.has(key)) {
    return candleStore.get(key)!;
  }

  const filePath = getStoreFilePath(symbol, timeframe);
  if (!fs.existsSync(filePath)) {
    candleStore.set(key, []);
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      candleStore.set(key, parsed);
      return parsed;
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, filePath }, "[HistoricalData] Failed to read store file");
  }

  candleStore.set(key, []);
  return [];
}

/**
 * Persists in-memory candles to disk atomically
 */
export function persistStoredCandles(symbol: string, timeframe: string): void {
  const key = getStoreKey(symbol, timeframe);
  const data = candleStore.get(key) || [];
  const filePath = getStoreFilePath(symbol, timeframe);
  const tempPath = `${filePath}.tmp`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (err: any) {
    logger.error({ err: err?.message, filePath }, "[HistoricalData] Failed to persist candles to disk");
  }
}

/**
 * Validates a candle record according to quantitative trading standards
 */
export function validateCandle(c: Partial<StoredCandle>): { isValid: boolean; issue?: string } {
  if (c.open === undefined || c.high === undefined || c.low === undefined || c.close === undefined) {
    return { isValid: false, issue: "Missing one or more OHLC fields" };
  }
  if (!Number.isFinite(c.open) || c.open <= 0 ||
      !Number.isFinite(c.high) || c.high <= 0 ||
      !Number.isFinite(c.low) || c.low <= 0 ||
      !Number.isFinite(c.close) || c.close <= 0) {
    return { isValid: false, issue: "All OHLC values must be finite positive numbers" };
  }
  if (c.high < c.open || c.high < c.close || c.high < c.low) {
    return { isValid: false, issue: `High (${c.high}) must be >= open, close, and low` };
  }
  if (c.low > c.open || c.low > c.close || c.low > c.high) {
    return { isValid: false, issue: `Low (${c.low}) must be <= open, close, and high` };
  }
  return { isValid: true };
}

/**
 * Upserts candles into persistent storage with unique key on (accountRef, symbol, timeframe, timestampUTC)
 */
export function upsertCandles(
  symbol: string,
  timeframe: string,
  rawCandles: Array<{
    timestampUTC: number;
    open: number;
    high: number;
    low: number;
    close: number;
    tickVolume?: number;
    volume?: number;
    spreadPoints?: number;
    brokerTimestamp?: string;
    dataSource?: "MetaApi" | "CSV_IMPORT" | "SYNTHETIC_FALLBACK";
    qualityStatus?: "VERIFIED" | "GAP_DETECTED" | "SUSPECT_ANOMALY" | "FORMING";
    accountRef?: string;
  }>
): { inserted: number; updated: number; invalid: number; totalStored: number } {
  const existing = loadStoredCandles(symbol, timeframe);
  const map = new Map<number, StoredCandle>();

  // Populate map with existing
  for (const c of existing) {
    map.set(c.timestampUTC, c);
  }

  let inserted = 0;
  let updated = 0;
  let invalid = 0;
  const now = Date.now();

  for (const rc of rawCandles) {
    const val = validateCandle(rc);
    if (!val.isValid) {
      invalid++;
      continue;
    }

    const t = Math.floor(rc.timestampUTC);
    const existingCandle = map.get(t);

    const candleRecord: StoredCandle = {
      accountRef: rc.accountRef || "MT5_LIVE",
      symbol: symbol.toUpperCase(),
      timeframe: timeframe.toLowerCase(),
      timestampUTC: t,
      isoUTC: new Date(t * 1000).toISOString(),
      brokerTimestamp: rc.brokerTimestamp,
      open: Number(rc.open.toFixed(2)),
      high: Number(rc.high.toFixed(2)),
      low: Number(rc.low.toFixed(2)),
      close: Number(rc.close.toFixed(2)),
      tickVolume: rc.tickVolume || rc.volume || 1,
      volume: rc.volume || rc.tickVolume || 1,
      spreadPoints: rc.spreadPoints !== undefined ? Number(rc.spreadPoints.toFixed(2)) : 0.45,
      dataSource: rc.dataSource || "MetaApi",
      importTimestamp: now,
      qualityStatus: rc.qualityStatus || "VERIFIED",
    };

    if (existingCandle) {
      map.set(t, candleRecord);
      updated++;
    } else {
      map.set(t, candleRecord);
      inserted++;
    }
  }

  // Convert back to sorted array
  const sorted = Array.from(map.values()).sort((a, b) => a.timestampUTC - b.timestampUTC);
  candleStore.set(getStoreKey(symbol, timeframe), sorted);
  persistStoredCandles(symbol, timeframe);

  return {
    inserted,
    updated,
    invalid,
    totalStored: sorted.length,
  };
}

/**
 * Audits data quality, intervals, order, and detects missing gaps
 */
export function auditHistoricalData(symbol = "XAUUSD", timeframe = "5m"): {
  total: number;
  issues: ValidationIssue[];
  coverage: HistoricalCoverageSummary;
} {
  const candles = loadStoredCandles(symbol, timeframe);
  const intervalSec = getTimeframeSeconds(timeframe);
  const issues: ValidationIssue[] = [];

  let gapCount = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const val = validateCandle(c);
    if (!val.isValid) {
      issues.push({
        index: i,
        timestampUTC: c.timestampUTC,
        type: "HIGH_VIOLATION",
        message: val.issue || "Malformed candle",
      });
    }

    if (i > 0) {
      const prev = candles[i - 1];
      if (c.timestampUTC <= prev.timestampUTC) {
        issues.push({
          index: i,
          timestampUTC: c.timestampUTC,
          type: c.timestampUTC === prev.timestampUTC ? "DUPLICATE" : "OUT_OF_ORDER",
          message: `Candle timestamp ${c.timestampUTC} <= previous ${prev.timestampUTC}`,
        });
      } else {
        const delta = c.timestampUTC - prev.timestampUTC;
        // Detect gaps exceeding expected interval (excluding normal weekend market closure ~48h)
        if (delta > intervalSec * 1.5) {
          const prevDate = new Date(prev.timestampUTC * 1000);
          const isWeekend = prevDate.getUTCDay() === 5 && delta <= 65 * 3600; // Friday close to Sunday open
          if (!isWeekend) {
            gapCount++;
            issues.push({
              index: i,
              timestampUTC: c.timestampUTC,
              type: "GAP",
              message: `Missing interval of ${Math.round(delta / 60)} minutes between ${prev.isoUTC} and ${c.isoUTC}`,
            });
          }
        }
      }
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const lastSec = candles.length > 0 ? candles[candles.length - 1].timestampUTC : 0;
  const freshnessMinutes = candles.length > 0 ? Math.round((nowSec - lastSec) / 60) : 999999;

  let dataQuality: HistoricalCoverageSummary["dataQuality"] = "EXCELLENT";
  if (candles.length === 0) dataQuality = "EMPTY";
  else if (gapCount > 5 || issues.length > 10) dataQuality = "GAPS_DETECTED";
  else if (gapCount > 0) dataQuality = "GOOD";

  const coverage: HistoricalCoverageSummary = {
    accountRef: candles.length > 0 ? candles[0].accountRef : "MT5_LIVE",
    symbol: symbol.toUpperCase(),
    timeframe: timeframe.toLowerCase(),
    candleCount: candles.length,
    firstCandleUTC: candles.length > 0 ? candles[0].isoUTC : null,
    lastCandleUTC: candles.length > 0 ? candles[candles.length - 1].isoUTC : null,
    gapCount,
    freshnessMinutes,
    dataQuality,
  };

  return {
    total: candles.length,
    issues: issues.slice(0, 100), // Return top 100 issues
    coverage,
  };
}

/**
 * Retrieves validated chronological OHLCCandles for backtesting or chart feeds
 */
export function getHistoricalCandlesForEngine(
  symbol = "XAUUSD",
  timeframe = "5m",
  limit = 1000
): OHLCCandle[] {
  const stored = loadStoredCandles(symbol, timeframe);
  if (stored.length === 0) return [];

  // Exclude any incomplete/forming current candle from backtest confirmation
  const confirmed = stored.filter(c => c.qualityStatus !== "FORMING");
  const slice = confirmed.slice(-limit);

  return slice.map(c => ({
    time: c.timestampUTC, // seconds epoch
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.tickVolume || c.volume,
  }));
}

/**
 * Dispatches historical sync to MetaApi to fetch and persist closed candles
 */
export async function syncHistoricalCandlesFromMetaApi(
  timeframe = "5m",
  targetCount = 1000
): Promise<{ success: boolean; newCandles: number; totalStored: number; summary: HistoricalCoverageSummary }> {
  const { getMetaApiHistoricalOHLC, getConfiguredSymbol } = await import("./metaApiFeed.js");
  const symbol = getConfiguredSymbol() || "GOLD";

  logger.info({ symbol, timeframe, targetCount }, "[HistoricalData] Syncing historical candles from MetaApi");

  // Fetch candles using official MetaApi integration
  const fetched = await getMetaApiHistoricalOHLC(timeframe, targetCount);
  if (!fetched || fetched.length === 0) {
    const audit = auditHistoricalData(symbol, timeframe);
    return {
      success: false,
      newCandles: 0,
      totalStored: audit.total,
      summary: audit.coverage,
    };
  }

  // Format into StoredCandle objects
  const rawList = fetched.map(c => {
    const t = normalizeToUnixSeconds(c.time);
    return {
      timestampUTC: t,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tickVolume: c.volume,
      volume: c.volume,
      spreadPoints: 0.45,
      dataSource: "MetaApi" as const,
      qualityStatus: "VERIFIED" as const,
    };
  });

  const result = upsertCandles(symbol, timeframe, rawList);
  const audit = auditHistoricalData(symbol, timeframe);

  logger.info(
    { symbol, timeframe, inserted: result.inserted, updated: result.updated, total: result.totalStored },
    "[HistoricalData] MetaApi historical sync complete"
  );

  return {
    success: true,
    newCandles: result.inserted,
    totalStored: result.totalStored,
    summary: audit.coverage,
  };
}

/**
 * Imports historical OHLC candle data from a CSV string
 */
export function importCandlesFromCsv(
  csvContent: string,
  symbol = "XAUUSD",
  timeframe = "5m"
): { success: boolean; imported: number; errors: string[] } {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return { success: false, imported: 0, errors: ["CSV file is empty or missing data rows"] };
  }

  const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/['"]/g, ""));
  const timeIdx = header.findIndex(h => h.includes("time") || h.includes("date") || h === "timestamp");
  const openIdx = header.findIndex(h => h.includes("open"));
  const highIdx = header.findIndex(h => h.includes("high"));
  const lowIdx = header.findIndex(h => h.includes("low"));
  const closeIdx = header.findIndex(h => h.includes("close"));
  const volIdx = header.findIndex(h => h.includes("vol"));
  const spreadIdx = header.findIndex(h => h.includes("spread"));

  if (openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1 || timeIdx === -1) {
    return {
      success: false,
      imported: 0,
      errors: ["Missing required CSV headers: Time/Date, Open, High, Low, Close"],
    };
  }

  const candlesToUpsert: any[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map(p => p.trim().replace(/['"]/g, ""));
    if (parts.length < 5) continue;

    const rawTime = parts[timeIdx];
    const open = parseFloat(parts[openIdx]);
    const high = parseFloat(parts[highIdx]);
    const low = parseFloat(parts[lowIdx]);
    const close = parseFloat(parts[closeIdx]);
    const volume = volIdx !== -1 ? parseFloat(parts[volIdx]) || 1 : 1;
    const spread = spreadIdx !== -1 ? parseFloat(parts[spreadIdx]) || 0.45 : 0.45;

    const t = normalizeToUnixSeconds(rawTime);
    if (!t || isNaN(t)) {
      errors.push(`Row ${i}: Invalid timestamp '${rawTime}'`);
      continue;
    }

    candlesToUpsert.push({
      timestampUTC: t,
      open,
      high,
      low,
      close,
      tickVolume: volume,
      volume,
      spreadPoints: spread,
      dataSource: "CSV_IMPORT",
      qualityStatus: "VERIFIED",
    });
  }

  if (candlesToUpsert.length === 0) {
    return { success: false, imported: 0, errors };
  }

  const res = upsertCandles(symbol, timeframe, candlesToUpsert);
  return {
    success: true,
    imported: res.inserted + res.updated,
    errors: errors.slice(0, 20),
  };
}
