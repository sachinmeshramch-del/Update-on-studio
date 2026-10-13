import type { OHLCCandle } from "./goldPrice.js";
import { getMetaApiHistoricalOHLC } from "./metaApiFeed.js";
import { logger } from "./logger.js";

export type OrbSessionName = "LONDON" | "NEW_YORK" | "ASIAN" | "OFF_SESSION";
export type OrbStage = "FORMING_RANGE" | "WAITING_BREAKOUT" | "BREAKOUT_TRIGGERED" | "SESSION_ENDED" | "OFF_SESSION";

export interface OrbRange {
  session: OrbSessionName;
  dateKey: string;
  high: number;
  low: number;
  range: number;
  mid: number;
  candleCount: number;
  rangeStartUtc: string;
  rangeEndUtc: string;
  breakoutWindowEndUtc: string;
}

export interface OrbStatus {
  session: OrbSessionName;
  stage: OrbStage;
  currentRange: {
    high: number;
    low: number;
    range: number;
    mid: number;
  } | null;
  tradeFiredToday: boolean;
  lastBreakoutDirection: "LONG" | "SHORT" | null;
  lastBreakoutTime: string | null;
  summary: string;
}

export interface OrbSignalResult {
  signal: "LONG" | "SHORT";
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  trend: "BULLISH" | "BEARISH";
  reason: string;
  tradeDuration: string;
  signalType: "ORB_BREAKOUT";
  engine: "DETERMINISTIC_ORB";
  orbRange: {
    session: OrbSessionName;
    high: number;
    low: number;
    range: number;
    mid: number;
  };
}

// ── In-Memory Session Memory & Cooldown ─────────────────────────────────────
// Keeps track of which sessions have already executed an ORB breakout today
const completedOrbSessions = new Set<string>(); // e.g. "2026-10-12_LONDON", "2026-10-12_NEW_YORK"

let cachedOrbRange: OrbRange | null = null;
let lastRangeFetchAt = 0;
const RANGE_CACHE_TTL_MS = 15_000; // 15s cache for range candles

/**
 * Returns the current active ORB session and its time boundaries in UTC.
 * London ORB: Range 07:00–07:15 UTC, Breakout window 07:15–11:00 UTC
 * New York ORB: Range 13:30–13:45 UTC, Breakout window 13:45–17:00 UTC
 * Asian ORB: Range 00:00–00:15 UTC, Breakout window 00:15–04:00 UTC
 */
export function getCurrentOrbSessionWindow(now: Date = new Date()): {
  session: OrbSessionName;
  isRangeWindow: boolean;
  isBreakoutWindow: boolean;
  rangeStartHour: number;
  rangeStartMin: number;
  rangeEndHour: number;
  rangeEndMin: number;
  breakoutEndHour: number;
  breakoutEndMin: number;
  dateKey: string;
} {
  const utcHours = now.getUTCHours();
  const utcMins = now.getUTCMinutes();
  const totalMins = utcHours * 60 + utcMins;

  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const dateKey = `${y}-${m}-${d}`;

  // Asian ORB: 00:00 - 00:15 UTC (Range), 00:15 - 04:00 UTC (Breakout)
  if (totalMins >= 0 && totalMins < 240) {
    const isRange = totalMins < 15;
    return {
      session: "ASIAN",
      isRangeWindow: isRange,
      isBreakoutWindow: !isRange,
      rangeStartHour: 0,
      rangeStartMin: 0,
      rangeEndHour: 0,
      rangeEndMin: 15,
      breakoutEndHour: 4,
      breakoutEndMin: 0,
      dateKey,
    };
  }

  // London ORB: 07:00 - 07:15 UTC (Range), 07:15 - 11:00 UTC (Breakout)
  if (totalMins >= 420 && totalMins < 660) {
    const isRange = totalMins < 435;
    return {
      session: "LONDON",
      isRangeWindow: isRange,
      isBreakoutWindow: !isRange,
      rangeStartHour: 7,
      rangeStartMin: 0,
      rangeEndHour: 7,
      rangeEndMin: 15,
      breakoutEndHour: 11,
      breakoutEndMin: 0,
      dateKey,
    };
  }

  // New York ORB: 13:30 - 13:45 UTC (Range), 13:45 - 17:00 UTC (Breakout)
  // (13*60 + 30 = 810 mins, 13*60 + 45 = 825 mins, 17*60 = 1020 mins)
  if (totalMins >= 810 && totalMins < 1020) {
    const isRange = totalMins < 825;
    return {
      session: "NEW_YORK",
      isRangeWindow: isRange,
      isBreakoutWindow: !isRange,
      rangeStartHour: 13,
      rangeStartMin: 30,
      rangeEndHour: 13,
      rangeEndMin: 45,
      breakoutEndHour: 17,
      breakoutEndMin: 0,
      dateKey,
    };
  }

  return {
    session: "OFF_SESSION",
    isRangeWindow: false,
    isBreakoutWindow: false,
    rangeStartHour: 0,
    rangeStartMin: 0,
    rangeEndHour: 0,
    rangeEndMin: 0,
    breakoutEndHour: 0,
    breakoutEndMin: 0,
    dateKey,
  };
}

/**
 * Calculates the Opening Range (High, Low, Mid, Range) for the current active session
 * from historical 1m or 5m candles.
 */
export async function calculateCurrentOpeningRange(): Promise<OrbRange | null> {
  const now = new Date();
  const windowInfo = getCurrentOrbSessionWindow(now);

  if (windowInfo.session === "OFF_SESSION") {
    cachedOrbRange = null;
    return null;
  }

  const sessionKey = `${windowInfo.dateKey}_${windowInfo.session}`;

  // Return cached range if still valid
  if (cachedOrbRange && cachedOrbRange.dateKey === sessionKey && Date.now() - lastRangeFetchAt < RANGE_CACHE_TTL_MS) {
    return cachedOrbRange;
  }

  try {
    // Fetch last 60 1m candles to compute the opening range
    const candles1m = await getMetaApiHistoricalOHLC("1m", 60).catch(() => [] as OHLCCandle[]);
    if (!candles1m || candles1m.length === 0) {
      return null;
    }

    // Filter candles that fell precisely within the range start and range end
    const rangeStartMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      windowInfo.rangeStartHour,
      windowInfo.rangeStartMin,
      0,
      0
    );

    const rangeEndMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      windowInfo.rangeEndHour,
      windowInfo.rangeEndMin,
      0,
      0
    );

    const breakoutEndMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      windowInfo.breakoutEndHour,
      windowInfo.breakoutEndMin,
      0,
      0
    );

    const rangeCandles = candles1m.filter((c) => {
      const cTime = typeof c.time === "number" ? (c.time > 1e12 ? c.time : c.time * 1000) : new Date(c.time).getTime();
      return cTime >= rangeStartMs && cTime <= rangeEndMs;
    });

    if (rangeCandles.length < 3) {
      // Range still forming or not enough candles in window
      return null;
    }

    let high = -Infinity;
    let low = Infinity;

    for (const c of rangeCandles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }

    if (high <= 0 || low >= Infinity || high <= low) {
      return null;
    }

    const range = +(high - low).toFixed(2);
    const mid = +((high + low) / 2).toFixed(2);

    const result: OrbRange = {
      session: windowInfo.session,
      dateKey: sessionKey,
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      range,
      mid,
      candleCount: rangeCandles.length,
      rangeStartUtc: new Date(rangeStartMs).toISOString(),
      rangeEndUtc: new Date(rangeEndMs).toISOString(),
      breakoutWindowEndUtc: new Date(breakoutEndMs).toISOString(),
    };

    cachedOrbRange = result;
    lastRangeFetchAt = Date.now();
    return result;
  } catch (err: any) {
    logger.debug({ err: err?.message || err }, "Error calculating current opening range");
    return null;
  }
}

/**
 * Returns current status of the Deterministic ORB Engine for UI & diagnostics.
 */
export async function getDeterministicOrbStatus(currentPrice?: number): Promise<OrbStatus> {
  const now = new Date();
  const windowInfo = getCurrentOrbSessionWindow(now);
  const sessionKey = `${windowInfo.dateKey}_${windowInfo.session}`;
  const tradeFiredToday = completedOrbSessions.has(sessionKey);

  if (windowInfo.session === "OFF_SESSION") {
    return {
      session: "OFF_SESSION",
      stage: "OFF_SESSION",
      currentRange: null,
      tradeFiredToday: false,
      lastBreakoutDirection: null,
      lastBreakoutTime: null,
      summary: "Off-session: Next session opening range will form at 00:00 (Asian), 07:00 (London), or 13:30 (New York) UTC.",
    };
  }

  if (windowInfo.isRangeWindow) {
    const partialRange = await calculateCurrentOpeningRange();
    return {
      session: windowInfo.session,
      stage: "FORMING_RANGE",
      currentRange: partialRange
        ? { high: partialRange.high, low: partialRange.low, range: partialRange.range, mid: partialRange.mid }
        : null,
      tradeFiredToday,
      lastBreakoutDirection: null,
      lastBreakoutTime: null,
      summary: `${windowInfo.session} Opening Range is currently forming (first 15m window). Monitoring high/low boundaries.`,
    };
  }

  const range = await calculateCurrentOpeningRange();
  if (!range) {
    return {
      session: windowInfo.session,
      stage: "WAITING_BREAKOUT",
      currentRange: null,
      tradeFiredToday,
      lastBreakoutDirection: null,
      lastBreakoutTime: null,
      summary: `${windowInfo.session} Opening Range data pending.`,
    };
  }

  if (tradeFiredToday) {
    return {
      session: windowInfo.session,
      stage: "BREAKOUT_TRIGGERED",
      currentRange: { high: range.high, low: range.low, range: range.range, mid: range.mid },
      tradeFiredToday: true,
      lastBreakoutDirection: null,
      lastBreakoutTime: null,
      summary: `${windowInfo.session} ORB breakout trade already executed for today. Cooldown active until next session.`,
    };
  }

  return {
    session: windowInfo.session,
    stage: "WAITING_BREAKOUT",
    currentRange: { high: range.high, low: range.low, range: range.range, mid: range.mid },
    tradeFiredToday: false,
    lastBreakoutDirection: null,
    lastBreakoutTime: null,
    summary: `${windowInfo.session} ORB active: Range [${range.low.toFixed(2)} — ${range.high.toFixed(2)} | width: ${range.range.toFixed(2)}pt]. Awaiting clean breakout.`,
  };
}

/**
 * Main Evaluation Routine: Evaluates whether a deterministic ORB breakout has occurred.
 * Returns an OrbSignalResult if all deterministic breakout criteria are satisfied.
 */
export async function evaluateDeterministicOrb(
  currentPrice: number,
  liveSpread: number = 0.50
): Promise<OrbSignalResult | null> {
  const now = new Date();
  const windowInfo = getCurrentOrbSessionWindow(now);

  // 1. Must be in an active breakout window (e.g. 07:15-11:00 or 13:45-17:00 UTC)
  if (!windowInfo.isBreakoutWindow || windowInfo.session === "OFF_SESSION") {
    return null;
  }

  const sessionKey = `${windowInfo.dateKey}_${windowInfo.session}`;

  // 2. Strict Deterministic Guard: Maximum 1 ORB trade per session per day to avoid whipsaws
  if (completedOrbSessions.has(sessionKey)) {
    return null;
  }

  // 3. Retrieve established opening range
  const orb = await calculateCurrentOpeningRange();
  if (!orb) {
    return null;
  }

  // 4. Deterministic Range Quality Filters for Gold (XAUUSD)
  // - Minimum Range: 2.00 pt (avoids dead session breakout traps)
  // - Maximum Range: 16.00 pt (if opening 15m already moved >16pt, market is overextended/exhausted)
  if (orb.range < 2.00 || orb.range > 16.00) {
    logger.debug(
      { session: orb.session, range: orb.range },
      "[Deterministic ORB] Range out of bounds (<2.0pt or >16.0pt). Skipping breakout."
    );
    return null;
  }

  // 5. Breakout Confirmation Buffer
  // Requires price to clear the boundary by at least 0.35 pt plus spread to avoid wick touches
  const breakoutBuffer = Math.max(0.35, +(liveSpread * 0.7).toFixed(2));
  const longBreakoutPrice = +(orb.high + breakoutBuffer).toFixed(2);
  const shortBreakoutPrice = +(orb.low - breakoutBuffer).toFixed(2);

  // ── LONG BREAKOUT ──────────────────────────────────────────────────────────
  if (currentPrice >= longBreakoutPrice) {
    // Widen Stop Loss Distance (preventing instant SL triggers from spreads/wicks)
    const stopLossDistance = Math.min(Math.max(currentPrice - orb.mid, 14.0), 28.0);
    const stopLoss = +(currentPrice - stopLossDistance).toFixed(2);

    // Keep Take Profit unchanged / fixed (do not expand with wider SL)
    const targetExpansion = Math.max(orb.range * 1.0, 12.0);
    const takeProfit = +(currentPrice + targetExpansion).toFixed(2);

    logger.info(
      {
        session: orb.session,
        high: orb.high,
        currentPrice,
        breakoutBuffer,
        stopLoss,
        takeProfit,
      },
      "🚀 [Deterministic ORB Engine] BULLISH BREAKOUT TRIGGERED!"
    );

    return {
      signal: "LONG",
      confidence: 88,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      trend: "BULLISH",
      reason: `[HYBRID DUAL-ENGINE: ${orb.session} ORB BREAKOUT] Price ${currentPrice.toFixed(2)} broke above ${orb.session} Range High ${orb.high.toFixed(2)} (+${breakoutBuffer}pt buffer) · Range: ${orb.range.toFixed(2)}pt`,
      tradeDuration: "15-60 mins (ORB Session Expansion)",
      signalType: "ORB_BREAKOUT",
      engine: "DETERMINISTIC_ORB",
      orbRange: {
        session: orb.session,
        high: orb.high,
        low: orb.low,
        range: orb.range,
        mid: orb.mid,
      },
    };
  }

  // ── SHORT BREAKOUT ─────────────────────────────────────────────────────────
  if (currentPrice <= shortBreakoutPrice) {
    // Widen Stop Loss Distance (preventing instant SL triggers from spreads/wicks)
    const stopLossDistance = Math.min(Math.max(orb.mid - currentPrice, 14.0), 28.0);
    const stopLoss = +(currentPrice + stopLossDistance).toFixed(2);

    // Keep Take Profit unchanged / fixed (do not expand with wider SL)
    const targetExpansion = Math.max(orb.range * 1.0, 12.0);
    const takeProfit = +(currentPrice - targetExpansion).toFixed(2);

    logger.info(
      {
        session: orb.session,
        low: orb.low,
        currentPrice,
        breakoutBuffer,
        stopLoss,
        takeProfit,
      },
      "🚀 [Deterministic ORB Engine] BEARISH BREAKOUT TRIGGERED!"
    );

    return {
      signal: "SHORT",
      confidence: 88,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      trend: "BEARISH",
      reason: `[HYBRID DUAL-ENGINE: ${orb.session} ORB BREAKOUT] Price ${currentPrice.toFixed(2)} broke below ${orb.session} Range Low ${orb.low.toFixed(2)} (-${breakoutBuffer}pt buffer) · Range: ${orb.range.toFixed(2)}pt`,
      tradeDuration: "15-60 mins (ORB Session Expansion)",
      signalType: "ORB_BREAKOUT",
      engine: "DETERMINISTIC_ORB",
      orbRange: {
        session: orb.session,
        high: orb.high,
        low: orb.low,
        range: orb.range,
        mid: orb.mid,
      },
    };
  }

  return null;
}

/**
 * Commits the execution of an ORB signal to memory so that subsequent ticks
 * do not re-fire the same session breakout.
 */
export function commitOrbSessionTrade(sessionName: OrbSessionName, dateKey?: string): void {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const key = `${dateKey || `${y}-${m}-${d}`}_${sessionName}`;
  completedOrbSessions.add(key);
  logger.info({ key }, "[Deterministic ORB Engine] Committed session trade. Cooldown locked for session.");
}
