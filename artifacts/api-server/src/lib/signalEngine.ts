import type { OHLCCandle } from "./goldPrice.js";
import { getMetaApiHistoricalOHLC } from "./metaApiFeed.js";
import {
  calcEMA,
  detectMarketStructure,
  calcRSI,
  calcMACD,
  calcATR,
  detectTrend,
  calcADX,
  calcVolumeSMA,
  detectOrderBlocks,
  getOBScore,
  detectCHoCH,
  detectSweepRejection,
  detectCandlePattern,
  analyzeMarketRange,
  getNearestSwingLevels,
  findSupportResistance,
} from "./technicalIndicators.js";
import { getAnalyticsSummary, isSmartMode } from "./performanceAnalytics.js";
import { logger } from "./logger.js";
import { sendTelegramNotification } from "./telegram.js";
import { getLatestSignal, getRecentSignals, getRunningTrades, getSystemSettings } from "@workspace/db";


export interface SessionInfo {
  london:  boolean;
  newYork: boolean;
  asian:   boolean;
  active:  string;
  marketOpen: boolean;
}

export interface SignalResult {
  signal:     "LONG" | "SHORT" | "HOLD";
  confidence: number;
  entryPrice: number;
  stopLoss:   number;
  takeProfit: number;
  trend:      "BULLISH" | "BEARISH" | "NEUTRAL";
  reason:     string;
  timestamp:  string;
  tradeDuration:     string;
  cooldownRemaining: number;
  smartMode:         boolean;
  session:           SessionInfo;
  signalStrength:    "STRONG" | "NORMAL" | null;
  spikeCooldownCandles: number; // candles remaining in post-spike cooldown (0 = clear)
  spikeCooldownRemaining: number; // seconds remaining in post-spike cooldown
  // Score breakdown (raw values, normalized to 100 for confidence)
  emaScore:      number;  // 0-35
  rsiScore:      number;  // 0-25
  macdScore:     number;  // 0-25
  momentumScore: number;  // 0-15
  fvgScore:      number;  // 0-25
  sweepScore:    number;  // 0-30
  obScore:       number;  // 0-25
  candleScore:   number;  // -10 to +20, scaled by patternStrength
  candlePattern: string | null; // pattern name for display (null if none, "(pending)" suffix if awaiting confirmation)
  signalType:    "TREND_FOLLOW" | "REVERSAL" | "RANGE";
  // ── Candlestick pattern confluence metadata ────────────────────────────
  patternDetected:      string | null;   // raw pattern name without status suffix
  patternStrength:      number;          // 0-100 wick-to-body quality score
  contextValid:         boolean;         // prior trend matches pattern direction
  confluenceMet:        boolean;         // strength≥60 AND contextValid AND near S/R
  confirmationStatus:   "confirmed" | "pending_confirmation" | "not_applicable" | null;
  indicators: {
    rsi:           number;
    ema9:          number;
    ema21:         number;
    macdLine:      number;
    macdSignal:    number;
    macdHistogram: number;
    atr:           number;
    trendPrimary: "BULLISH" | "BEARISH" | "NEUTRAL";
    trendEntry: "BULLISH" | "BEARISH" | "NEUTRAL";
    trend1h?: "BULLISH" | "BEARISH" | "NEUTRAL";
  };
  circuitBreakerActive: boolean;
  circuitBreakerRemainingMinutes: number;
  consecutiveLosses: number;
}

interface LastSignalState {
  signal:    "LONG" | "SHORT" | "HOLD";
  price:     number;
  timestamp: number;
}



export interface FVGZone {
  type: "BULLISH" | "BEARISH";
  low:  number;
  high: number;
}

let lastSignalState: LastSignalState | null = null;
let cachedSignal:    SignalResult | null = null;
let lastSignalTime = 0;

// ── Raw Candle Cache (caches historical fetch for 4s, but re-evaluates indicators & cooldown on every tick) ──
let cachedCandlesTime = 0;
let cachedCandlesPrimary: OHLCCandle[] = [];
let cachedCandlesEntry: OHLCCandle[] = [];
let cachedCandlesMacro: OHLCCandle[] = [];
let cachedCandlesHTF: OHLCCandle[] = [];
const CANDLE_CACHE_TTL = 4_000;

// ── Two-candle confirmation state ─────────────────────────────────────────
// Hammer, Shooting Star, and Doji patterns require the NEXT candle to close
// in the expected reversal direction before the signal is used for scoring.
// Engulfing patterns are self-confirming (two-candle by nature) — immediate.
interface PendingPatternState {
  pattern:           string;
  bias:              "BULLISH" | "BEARISH";
  patternStrength:   number;
  contextValid:      boolean;
  confluenceMet:     boolean;
  formingCandleTime: number;  // candlesPrimary[length-1].time at detection
  detectedClose:     number;  // close of that forming candle (to measure follow-through)
}
let pendingPattern: PendingPatternState | null = null;
const SINGLE_CANDLE_PATTERNS = new Set(["Hammer", "Dragonfly Doji", "Shooting Star", "Gravestone Doji"]);

// ── Post-spike cooldown state ─────────────────────────────────────────────
let spikeDetectedAt = 0;
let lastSpikeCandleTime = 0; // tracks which candle triggered the spike to avoid re-triggering on the same candle
const SPIKE_ATR_MULT       = 2.5;   // body must exceed ATR × this
const SPIKE_COOLDOWN_COUNT = 1;     // candles to block after a spike
const CANDLE_PRIMARY_MS         = 900_000; // 15 min in ms

// ── Intraday constants ────────────────────────────────────────────────────
const SIGNAL_CACHE_TTL        = 60_000;   // 1 minute
const COOLDOWN_MS             = 900_000;  // 15 mins  // 1 hour between signals
const MIN_SIGNAL_INTERVAL_MS  = 5 * 60_000; // 5-min hard floor // 5-min hard floor — no signal can fire within 5 min of the last, regardless of price move
const MIN_CONF_NORMAL         = 50;
const MIN_CONF_STRONG         = 65;
const MIN_CONF_REVERSAL       = 60;  // counter-trend trades need higher conviction
const MIN_CONF_RANGE          = 55;  // range-bound / consolidation markets require high conviction
const MIN_PRICE_MOVE_PCT      = 0.004;    // 0.2% to override standard cooldown (raised from 0.1% — $4→$8 on gold)
const MAX_RAW_SCORE           = 125;      // realistic max without all institutional factors aligning

// ── Session detection ─────────────────────────────────────────────────────
function getCurrentSession(): SessionInfo {
  const now = new Date();
  
  // Use America/New_York timezone to perfectly handle Daylight Saving Time
  const nyFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    weekday: "short"
  });
  const parts = nyFormatter.formatToParts(now);
  let nyHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  if (nyHour === 24) nyHour = 0;
  const nyDayStr = parts.find(p => p.type === 'weekday')?.value;

  // NY Close is Friday 5 PM. Opens Sunday 5 PM.
  // Daily break is 5 PM to 6 PM NY time (17:00 to 18:00)
  const isWeekend = nyDayStr === 'Sat' || (nyDayStr === 'Fri' && nyHour >= 17) || (nyDayStr === 'Sun' && nyHour < 17);
  const isDailyBreak = !isWeekend && nyHour === 17;

  const marketOpen = !isWeekend && !isDailyBreak;

  const h = now.getUTCHours(); // Keep basic UTC hours for session names
  const london  = marketOpen && h >= 7  && h < 17;
  const newYork = marketOpen && h >= 13 && h < 22;
  const asian   = marketOpen && (h >= 22 || h < 7);

  const active =
    !marketOpen       ? "Market Closed" :
    london && newYork ? "London / New York" :
    london            ? "London" :
    newYork           ? "New York" :
    asian             ? "Asian" :
    "Off-hours";

  return { london, newYork, asian, active, marketOpen };
}

function overallTrend(
  t5m: "BULLISH" | "BEARISH" | "NEUTRAL",
  t1m: "BULLISH" | "BEARISH" | "NEUTRAL",
): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const score =
    (t5m === "BULLISH" ? 1 : t5m === "BEARISH" ? -1 : 0) +
    (t1m === "BULLISH" ? 1 : t1m === "BEARISH" ? -1 : 0);
  if (score >= 1)  return "BULLISH";
  if (score <= -1) return "BEARISH";
  return "NEUTRAL";
}

// ── Recent candle momentum (faster than EMA — catches reversals earlier) ──
// Looks at the last 4 completed 5m candles (excludes forming candle).
// Returns BULLISH when ≥3 candles closed bullish, BEARISH when ≥3 closed bearish.
// A -25 penalty is applied to any signal that opposes this momentum, which overrides
// lagging EMA alignment and prevents LONG signals firing into a bearish momentum wave.
export function getRecentMomentum(candles: OHLCCandle[]): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (candles.length < 5) return "NEUTRAL";
  // Exclude the forming candle (index -1); sample the 4 before it
  const recent = candles.slice(candles.length - 5, candles.length - 1);
  let bull = 0, bear = 0;
  for (const c of recent) {
    if (c.close > c.open) bull++;
    else if (c.close < c.open) bear++;
  }
  if (bull >= 3) return "BULLISH";
  if (bear >= 3) return "BEARISH";
  return "NEUTRAL";
}

// ── Consecutive-stop circuit breaker & loss cooldown ──────────────────────
export interface StopHistoryAnalysis {
  longStops: number;
  shortStops: number;
  consecutiveLosses: number;
  lastLossTime: number;
  recentLossCount1h: number;
  inCircuitBreakerCooldown: boolean;
  cooldownRemainingMinutes: number;
  longLosses2h: number;
  shortLosses2h: number;
  longNetPnl2h: number;
  shortNetPnl2h: number;
  longDirectionCooldown: boolean;
  shortDirectionCooldown: boolean;
  directionalCooldownRemainingMinutes: number;
  lastWinTime: number;
  lastWinDirection: "LONG" | "SHORT" | null;
  lastWinPnl: number;
}

async function getRecentStopCounts(): Promise<StopHistoryAnalysis> {
  try {
    const rows = await getRecentSignals(25);
    let longStops = 0, shortStops = 0;
    let consecutiveLosses = 0;
    let lastLossTime = 0;
    let recentLossCount1h = 0;
    let longLosses2h = 0;
    let shortLosses2h = 0;
    let longNetPnl2h = 0;
    let shortNetPnl2h = 0;
    let lastLongLossTime = 0;
    let lastShortLossTime = 0;
    let lastWinTime = 0;
    let lastWinDirection: "LONG" | "SHORT" | null = null;
    let lastWinPnl = 0;

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const twoHoursAgo = now - 120 * 60 * 1000;

    const completed = rows.filter((r: any) => r.tradeStatus === "STOP_HIT" || r.tradeStatus === "TARGET_HIT");
    
    let countingStreak = true;
    for (const r of completed) {
      const tradeTime = r.closedAt ? new Date(r.closedAt).getTime() : (r.createdAt ? new Date(r.createdAt).getTime() : 0);
      const pnl = r.pnlPoints ?? 0;

      // Track 2-hour directional metrics
      if (tradeTime > twoHoursAgo) {
        if (r.signal === "LONG") {
          longNetPnl2h += pnl;
          if (pnl < -0.1) {
            longLosses2h++;
            if (lastLongLossTime === 0) lastLongLossTime = tradeTime;
          }
        } else if (r.signal === "SHORT") {
          shortNetPnl2h += pnl;
          if (pnl < -0.1) {
            shortLosses2h++;
            if (lastShortLossTime === 0) lastShortLossTime = tradeTime;
          }
        }
      }

      // Real capital loss: ONLY when pnlPoints < -0.1 (initial protective SL hit)
      // If pnlPoints > 0, it was a profitable trailing stop exit (a WIN!)
      // If pnlPoints === 0, it was break-even (capital preserved)
      if (pnl < -0.1) {
        if (tradeTime > oneHourAgo) recentLossCount1h++;
        if (lastLossTime === 0 && tradeTime > 0) lastLossTime = tradeTime;
        if (countingStreak) consecutiveLosses++;
      } else if (pnl >= 1.5 || r.tradeStatus === "TARGET_HIT") {
        // Track the most recent substantial win for exhaustion cooldown
        if (lastWinTime === 0 && pnl >= 5.0) { // Big win threshold
            lastWinTime = tradeTime;
            lastWinDirection = r.signal;
            lastWinPnl = pnl;
        }
        
        // Only a substantial win (>= +1.5 pts or target hit) breaks the loss streak!
        // Micro/scratch trailing stop exits (+0.2 to +0.5 pts) do NOT reset a loss streak.
        countingStreak = false;
      }
    }

    for (const r of completed.slice(0, 6)) {
      const pnl = r.pnlPoints ?? 0;
      if (pnl < -0.1) {
        if (r.signal === "LONG")  longStops++;
        if (r.signal === "SHORT") shortStops++;
      }
    }

    // Global Circuit breaker: 2+ consecutive REAL losses OR 2+ REAL losses in past hour -> 45-min protection cooldown
    const CIRCUIT_BREAKER_WINDOW_MS = 45 * 60 * 1000;
    const inCircuitBreakerCooldown =
      (consecutiveLosses >= 2 || recentLossCount1h >= 2) &&
      lastLossTime > 0 &&
      now - lastLossTime < CIRCUIT_BREAKER_WINDOW_MS;

    const cooldownRemainingMinutes = inCircuitBreakerCooldown
      ? Math.max(1, Math.ceil((CIRCUIT_BREAKER_WINDOW_MS - (now - lastLossTime)) / 60000))
      : 0;

    // Directional circuit breaker: 2+ losses in 2 hours OR net directional PnL <= -5.0 pts
    const DIRECTIONAL_WINDOW_MS = 45 * 60 * 1000;
    const longDirectionCooldown =
      (longLosses2h >= 2 || longNetPnl2h <= -5.0) &&
      lastLongLossTime > 0 &&
      now - lastLongLossTime < DIRECTIONAL_WINDOW_MS;

    const shortDirectionCooldown =
      (shortLosses2h >= 2 || shortNetPnl2h <= -5.0) &&
      lastShortLossTime > 0 &&
      now - lastShortLossTime < DIRECTIONAL_WINDOW_MS;

    const directionalCooldownRemainingMinutes = Math.max(
      longDirectionCooldown ? Math.max(1, Math.ceil((DIRECTIONAL_WINDOW_MS - (now - lastLongLossTime)) / 60000)) : 0,
      shortDirectionCooldown ? Math.max(1, Math.ceil((DIRECTIONAL_WINDOW_MS - (now - lastShortLossTime)) / 60000)) : 0
    );

    return {
      longStops,
      shortStops,
      consecutiveLosses,
      lastLossTime,
      recentLossCount1h,
      inCircuitBreakerCooldown,
      cooldownRemainingMinutes,
      longLosses2h,
      shortLosses2h,
      longNetPnl2h,
      shortNetPnl2h,
      longDirectionCooldown,
      shortDirectionCooldown,
      directionalCooldownRemainingMinutes,
      lastWinTime,
      lastWinDirection,
      lastWinPnl
    };
  } catch {
    return {
      longStops: 0,
      shortStops: 0,
      consecutiveLosses: 0,
      lastLossTime: 0,
      recentLossCount1h: 0,
      inCircuitBreakerCooldown: false,
      cooldownRemainingMinutes: 0,
      longLosses2h: 0,
      shortLosses2h: 0,
      longNetPnl2h: 0,
      shortNetPnl2h: 0,
      longDirectionCooldown: false,
      shortDirectionCooldown: false,
      directionalCooldownRemainingMinutes: 0,
      lastWinTime: 0,
      lastWinDirection: null,
      lastWinPnl: 0
    };
  }
}

// ── FVG Detection ─────────────────────────────────────────────────────────
export function detectFVGZones(candles: OHLCCandle[], volSma: number[] = []): FVGZone[] {
  const zones: FVGZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2]!; // 2 bars before
    const c1 = candles[i - 1]!; // middle gap bar
    const c2 = candles[i]!;     // current bar
    
    // Check if middle gap bar (c1) has volume or strong body
    const avgVol = volSma[i - 1] || 0;
    const body1 = Math.abs(c1.close - c1.open);
    const isHighVol = avgVol === 0 || (c1.volume || 0) > avgVol * 1.05 || body1 > 2.0;

    if (isHighVol) {
      // Bullish FVG: gap up between c0.high and c2.low
      if (c0.high < c2.low) {
        zones.push({ type: "BULLISH", low: +c0.high.toFixed(2), high: +c2.low.toFixed(2) });
      }
      // Bearish FVG: gap down between c2.high and c0.low
      else if (c0.low > c2.high) {
        zones.push({ type: "BEARISH", low: +c2.high.toFixed(2), high: +c0.low.toFixed(2) });
      }
    }
  }
  return zones.slice(-10); // keep only last 10 FVG zones
}

export function getFVGScore(price: number, zones: FVGZone[], direction: "LONG" | "SHORT"): number {
  for (const zone of zones) {
    // If price is inside the FVG or tapping the boundary
    if (direction === "LONG"  && zone.type === "BULLISH" && price >= (zone.low - 0.5) && price <= (zone.high + 0.5)) return 25;
    if (direction === "SHORT" && zone.type === "BEARISH" && price >= (zone.low - 0.5) && price <= (zone.high + 0.5)) return 25;
  }
  return 0;
}

// ── Liquidity Sweep Detection ─────────────────────────────────────────────
export function detectLiquiditySweep(candles: OHLCCandle[], volSma: number[] = []): "BULLISH" | "BEARISH" | null {
  const start = Math.max(1, candles.length - 6);
  for (let i = candles.length - 1; i >= start; i--) {
    const candle = candles[i]!;
    const prev   = candles[i - 1]!;
    const body   = Math.abs(candle.close - candle.open);
    
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    
    const lowerWickRatio = body > 0.01 ? lowerWick / body : lowerWick > 0 ? 999 : 0;
    const upperWickRatio = body > 0.01 ? upperWick / body : upperWick > 0 ? 999 : 0;
    
    const avgVol = volSma[i] || 0;
    const isHighVol = avgVol === 0 || (candle.volume || 0) > avgVol * 1.05;

    // Bullish sweep (swept prev low, closed back above with rejection wick or bullish close)
    if (candle.low < prev.low && candle.close > prev.low && (lowerWickRatio > 0.7 || candle.close > candle.open)) {
      return "BULLISH";
    }
    // Bearish sweep (swept prev high, closed back below with rejection wick or bearish close)
    if (candle.high > prev.high && candle.close < prev.high && (upperWickRatio > 0.7 || candle.close < candle.open)) {
      return "BEARISH";
    }
  }
  return null;
}

export async function generateSignal(currentPrice: number, isCommit = false, liveSpread = 0.50): Promise<SignalResult> {
  const now = Date.now();

  const sinceLastSignal    = now - lastSignalTime;
  const cooldownRemaining  = Math.max(0, Math.ceil((COOLDOWN_MS - sinceLastSignal) / 1000));
  const smartMode = isSmartMode();
  const session   = getCurrentSession();

  // ── Market-closed guard (weekends: Sat all day + Sun before 22:00 UTC) ────
  if (!session.marketOpen) {
    return {
      signal:               "HOLD",
      confidence:           0,
      entryPrice:           +currentPrice.toFixed(2),
      stopLoss:             +(currentPrice - 3).toFixed(2),
      takeProfit:           +(currentPrice + 4.5).toFixed(2),
      trend:                "NEUTRAL",
      reason:               "HOLD – Market closed (weekend) · Opens Sunday 22:00 UTC",
      timestamp:            new Date().toISOString(),
      tradeDuration:        "—",
      cooldownRemaining:    0,
      smartMode,
      session,
      signalStrength:       null,
      spikeCooldownCandles: 0,
      spikeCooldownRemaining: 0,
      emaScore:      0,
      rsiScore:      0,
      macdScore:     0,
      momentumScore: 0,
      fvgScore:      0,
      sweepScore:    0,
      obScore:       0,
      candleScore:         0,
      candlePattern:       null,
      signalType:          "TREND_FOLLOW" as const,
      patternDetected:     null,
      patternStrength:     0,
      contextValid:        false,
      confluenceMet:       false,
      confirmationStatus:  null,
      indicators: {
        rsi: 50, ema9: currentPrice, ema21: currentPrice,
        macdLine: 0, macdSignal: 0, macdHistogram: 0, atr: 3,
        trendPrimary: "NEUTRAL", trendEntry: "NEUTRAL",
      },
      circuitBreakerActive: false,
      circuitBreakerRemainingMinutes: 0,
      consecutiveLosses: 0,
    };
  }

  // Compute fresh spike cooldown status on every call (time-based, no candles needed)
  const _spikeElapsed = now - spikeDetectedAt;
  const _spikeCdMs    = SPIKE_COOLDOWN_COUNT * CANDLE_PRIMARY_MS;
  const freshSpikeCooldownCandles = (spikeDetectedAt > 0 && _spikeElapsed < _spikeCdMs)
    ? Math.ceil((_spikeCdMs - _spikeElapsed) / CANDLE_PRIMARY_MS)
    : 0;

  // ── SPIKE GATE (runs before cache, before everything) ─────────────────────
  // Must fire here so that cached signals from before the spike are also blocked
  logger.info({ spikeCooldownActive: freshSpikeCooldownCandles > 0, candlesRemaining: freshSpikeCooldownCandles }, "[SpikeGuard] Cooldown active");
  if (freshSpikeCooldownCandles > 0) {
    logger.warn({ candlesRemaining: freshSpikeCooldownCandles }, `[SpikeGuard] Signals blocked: true (${freshSpikeCooldownCandles} candle${freshSpikeCooldownCandles !== 1 ? "s" : ""} remaining)`);
    const spikeReason = `HOLD – Spike cooldown (${freshSpikeCooldownCandles} candle${freshSpikeCooldownCandles !== 1 ? "s" : ""} remaining) · Signals blocked until spike settles`;
    const base = cachedSignal ?? {
      confidence: 0, entryPrice: +currentPrice.toFixed(2),
      stopLoss: +(currentPrice - 3).toFixed(2), takeProfit: +(currentPrice + 4.5).toFixed(2),
      trend: "NEUTRAL" as const, tradeDuration: "2-8 hours",
      signalStrength: null, emaScore: 0, rsiScore: 0, macdScore: 0,
      momentumScore: 0, fvgScore: 0, sweepScore: 0, obScore: 0, candleScore: 0, candlePattern: null, signalType: "TREND_FOLLOW" as const,
      patternDetected: null, patternStrength: 0, contextValid: false, confluenceMet: false, confirmationStatus: null,
      indicators: { rsi: 50, ema9: currentPrice, ema21: currentPrice, macdLine: 0, macdSignal: 0, macdHistogram: 0, atr: 3, trendPrimary: "NEUTRAL" as const, trendEntry: "NEUTRAL" as const },
    };
    return {
      ...base,
      signal:               "HOLD",
      reason:               spikeReason,
      timestamp:            new Date().toISOString(),
      cooldownRemaining,
      smartMode,
      session,
      spikeCooldownCandles: freshSpikeCooldownCandles,
      spikeCooldownRemaining: Math.max(0, Math.ceil((_spikeCdMs - _spikeElapsed) / 1000)),
      circuitBreakerActive: false,
      circuitBreakerRemainingMinutes: 0,
      consecutiveLosses: 0,
    };
  }

  
  

  const analytics = await getAnalyticsSummary();
  const minConf = smartMode && analytics.sufficientData ? MIN_CONF_NORMAL + 5 : MIN_CONF_NORMAL;

  try {
    // ── Fetch 5m (primary), 1m (entry refinement), and 15m (macro structure) ──
    const fetchWithFallback = async (tf: string, count: number) => {
      try {
        const { getMetaApiHistoricalOHLC } = await import("./metaApiFeed.js");
        return await getMetaApiHistoricalOHLC(tf, count);
      } catch (metaErr) {
        logger.debug({ tf, err: (metaErr as any)?.message }, "MetaApi historical candle fetch failed (no fallback permitted)");
        throw new Error(`Primary data source unavailable for ${tf} candles.`);
      }
    };
    
    let candlesPrimary: OHLCCandle[];
    let candlesEntry: OHLCCandle[];
    let candlesMacro: OHLCCandle[];
    let candlesHTF: OHLCCandle[];

    try {
      if (Date.now() - cachedCandlesTime < CANDLE_CACHE_TTL && cachedCandlesPrimary.length > 0) {
        // Use cached candles and clone them
        candlesPrimary = cachedCandlesPrimary.map(c => ({ ...c }));
        candlesEntry = cachedCandlesEntry.map(c => ({ ...c }));
        candlesMacro = cachedCandlesMacro.map(c => ({ ...c }));
        candlesHTF = cachedCandlesHTF.map(c => ({ ...c }));
      } else {
        candlesPrimary = await fetchWithFallback("5m", 300);
        candlesEntry = await fetchWithFallback("1m", 300);
        try {
          candlesMacro = await fetchWithFallback("15m", 100);
        } catch {
          // Synthesize 15m candles from 5m candles if direct 15m REST fetch is delayed
          candlesMacro = [];
          for (let i = 0; i < candlesPrimary.length; i += 3) {
            const chunk = candlesPrimary.slice(i, i + 3);
            if (chunk.length === 0) continue;
            candlesMacro.push({
              time: chunk[0].time,
              open: chunk[0].open,
              high: Math.max(...chunk.map(c => c.high)),
              low: Math.min(...chunk.map(c => c.low)),
              close: chunk[chunk.length - 1].close,
              volume: chunk.reduce((sum, c) => sum + (c.volume || 1), 0),
            });
          }
        }
        try {
          candlesHTF = await fetchWithFallback("1h", 100);
        } catch {
          // Synthesize 1h candles from 5m candles if direct 1h fetch is delayed
          candlesHTF = [];
          for (let i = 0; i < candlesPrimary.length; i += 12) {
            const chunk = candlesPrimary.slice(i, i + 12);
            if (chunk.length === 0) continue;
            candlesHTF.push({
              time: chunk[0].time,
              open: chunk[0].open,
              high: Math.max(...chunk.map(c => c.high)),
              low: Math.min(...chunk.map(c => c.low)),
              close: chunk[chunk.length - 1].close,
              volume: chunk.reduce((sum, c) => sum + (c.volume || 1), 0),
            });
          }
        }
        cachedCandlesPrimary = candlesPrimary.map(c => ({ ...c }));
        cachedCandlesEntry = candlesEntry.map(c => ({ ...c }));
        cachedCandlesMacro = candlesMacro.map(c => ({ ...c }));
        cachedCandlesHTF = candlesHTF.map(c => ({ ...c }));
        cachedCandlesTime = Date.now();
      }
    } catch (candleFetchErr) {
      if (cachedCandlesPrimary.length > 0) {
        logger.warn("Transient candle fetch issue; continuing signal analysis using cached candles");
        candlesPrimary = cachedCandlesPrimary.map(c => ({ ...c }));
        candlesEntry = cachedCandlesEntry.map(c => ({ ...c }));
        candlesMacro = cachedCandlesMacro.map(c => ({ ...c }));
        candlesHTF = cachedCandlesHTF.map(c => ({ ...c }));
      } else {
        throw candleFetchErr;
      }
    }
    const recentStops = await getRecentStopCounts();

    // Override the most recent candle's close with the real-time live price
    // This allows us to cache MetaApi historical requests for longer without losing live precision
    // Override the most recent candle's close with the real-time live price
    // Also override High/Low if the live price exceeds them
    const updateLiveCandle = (candles: any[]) => {
        if (candles.length === 0) return;
        const last = candles[candles.length - 1];
        last.close = currentPrice;
        if (currentPrice > last.high) last.high = currentPrice;
        if (currentPrice < last.low) last.low = currentPrice;
    };
    updateLiveCandle(candlesPrimary);
    updateLiveCandle(candlesEntry);
    updateLiveCandle(candlesMacro);
    updateLiveCandle(candlesHTF);

    const closes5m = candlesPrimary.map(c => c.close);
    const closes1m = candlesEntry.map(c => c.close);
    const closes15m = candlesMacro.map(c => c.close);
    
    const ema9_15m = calcEMA(closes15m, 9);
    const ema21_15m = calcEMA(closes15m, 21);
    const trendMacro = detectTrend(ema9_15m, ema21_15m);

    // ── 1-Hour Macro Trend & EMAs ─────────────────────────────────────────
    const closes1h = candlesHTF.map(c => c.close);
    const ema20_1h = calcEMA(closes1h, 20);
    const ema50_1h = calcEMA(closes1h, 50);
    const trend1h = detectTrend(ema20_1h, ema50_1h);
    const lastEma20_1h = ema20_1h[ema20_1h.length - 1] ?? currentPrice;
    const lastEma50_1h = ema50_1h[ema50_1h.length - 1] ?? currentPrice;
    const ms1h = detectMarketStructure(candlesHTF);

    // ── EMAs on 5m ────────────────────────────────────────────────────────
    const ema9_5m  = calcEMA(closes5m, 9);
    const ema21_5m = calcEMA(closes5m, 21);
    const ema9  = ema9_5m[ema9_5m.length - 1]   ?? currentPrice;
    const ema21 = ema21_5m[ema21_5m.length - 1] ?? currentPrice;

    // Detect fresh EMA cross (within last 3 bars)
    let freshCross: "BULLISH" | "BEARISH" | null = null;
    if (ema9_5m.length >= 4 && ema21_5m.length >= 4) {
      const prevE9  = ema9_5m[ema9_5m.length - 4];
      const prevE21 = ema21_5m[ema21_5m.length - 4];
      if (prevE9 !== undefined && prevE21 !== undefined) {
        if (prevE9 <= prevE21 && ema9  >  ema21) freshCross = "BULLISH";
        if (prevE9 >= prevE21 && ema9  <  ema21) freshCross = "BEARISH";
      }
    }

    // ── RSI (14) on 5m ────────────────────────────────────────────────────
    const rsi5mArr = calcRSI(closes5m, 14);
    const rsi      = rsi5mArr[rsi5mArr.length - 1] ?? 50;
    
    // ── ADX (Trend Strength) ──────────────────────────────────────────────
    const { adx: adxArr } = calcADX(candlesPrimary, 14);
    const currentAdx = adxArr[adxArr.length - 1] ?? 0;

    // ── MACD (12,26,9) on 5m ──────────────────────────────────────────────
    const { macdLine, signalLine, histogram } = calcMACD(closes5m);
    const macdVal      = macdLine[macdLine.length - 1]    ?? 0;
    const macdSig      = signalLine[signalLine.length - 1] ?? 0;
    const macdHist     = histogram[histogram.length - 1]   ?? 0;
    const macdPrevHist = histogram[histogram.length - 2]   ?? 0;
    const macdBullish  = macdHist > 0 && macdHist > macdPrevHist;
    const macdBearish  = macdHist < 0 && macdHist < macdPrevHist;
    const macdCrossBull = macdPrevHist <= 0 && macdHist > 0;
    const macdCrossBear = macdPrevHist >= 0 && macdHist < 0;

    // ── ATR (14) on 5m ────────────────────────────────────────────────────
    const atrArr = calcATR(candlesPrimary, 14);
    const atr    = atrArr[atrArr.length - 1] ?? 3;

    // ── Post-spike cooldown detection ─────────────────────────────────────
    // Check BOTH the forming candle (index -1) AND the last completed candle
    // (index -2). A spike firing at 11:02 on a 5m chart started at 11:00 is
    // still forming — index -2 won't show it yet, so we'd miss it entirely.
    // ── Candle index verification log ─────────────────────────────────────
    const closedCandle   = candlesPrimary[candlesPrimary.length - 2];
    const formingCandle  = candlesPrimary[candlesPrimary.length - 1];
    logger.info(
      {
        "Using candle index -2 (closed) close":  closedCandle  ? +closedCandle.close.toFixed(2)  : null,
        "Using candle index -1 (forming) close": formingCandle ? +formingCandle.close.toFixed(2) : null,
        totalCandles5m: candlesPrimary.length,
      },
      "Candle index check"
    );

    const spikeThreshold = atr * SPIKE_ATR_MULT;
    const candidates = [
      candlesPrimary[candlesPrimary.length - 1], // forming candle — spike in progress
      candlesPrimary[candlesPrimary.length - 2], // last completed candle
    ].filter(Boolean) as any[];

    for (const candle of candidates) {
      const body = Math.abs(candle.close - candle.open);
      const range = candle.high - candle.low;
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      
      // Is this a clean directional displacement candle (e.g. solid body, small opposing wick)?
      const isCleanBullishDisplacement = candle.close > candle.open && body >= atr * 1.5 && upperWick <= body * 0.35;
      const isCleanBearishDisplacement = candle.close < candle.open && body >= atr * 1.5 && lowerWick <= body * 0.35;
      const isDirectionalExpansion = isCleanBullishDisplacement || isCleanBearishDisplacement;

      // 🚨 Liquidity Plunge / Flash Crash Detection (4x ATR anomaly)
      const isFlashCrash = range >= atr * 4.0;
      
      if (isFlashCrash) {
         logger.warn({ range, atr }, "🚨 FLASH CRASH DETECTED! Massive liquidity plunge anomaly.");
         sendTelegramNotification("🚨 *FLASH CRASH DETECTED* 🚨\nMassive liquidity plunge on Gold! Pausing normal trading algorithms to protect capital. Waiting for Fair Value Gap (FVG) recovery opportunity...").catch(console.error);
      }

      // News chop spike: two-sided massive wicks (range much larger than body, or giant opposing wick)
      const isWhipsawSpike = (range > spikeThreshold * 2.0 && !isDirectionalExpansion) || (body > spikeThreshold && !isDirectionalExpansion);
      
      // Guard against wild currentPrice glitches from the feed
      const lastClose = candidates[1] ? candidates[1].close : candle.close;
      const isFeedGlitch = Math.abs(currentPrice - lastClose) > atr * 5.0;

      let spikeDetected = isWhipsawSpike || isFeedGlitch || isFlashCrash;

      logger.info(
        { "Candle body": +body.toFixed(2), "Range": +range.toFixed(2), "ATR": +atr.toFixed(2), "Threshold": +spikeThreshold.toFixed(2), "Spike detected": spikeDetected, isDirectionalExpansion },
        "Spike check"
      );
      if (spikeDetected) {
        const candleTime = candle.time ?? 0;
        if (candleTime !== lastSpikeCandleTime) {
          // Genuinely new spike candle — start a fresh cooldown window
          spikeDetectedAt     = now;
          lastSpikeCandleTime = candleTime;
          cachedSignal        = null; // discard pre-spike cached signal
          logger.warn(
            { body: +body.toFixed(2), atr: +atr.toFixed(2), threshold: +spikeThreshold.toFixed(2), blockingMinutes: 10, candleTime },
            "SPIKE COOLDOWN ACTIVATED — Blocking signals for 10 minutes"
          );
        } else {
          // Same candle is still in the OHLC window — do NOT reset the timer
          logger.info(
            { candleTime, remainingMs: (SPIKE_COOLDOWN_COUNT * CANDLE_PRIMARY_MS) - (now - spikeDetectedAt) },
            "[SpikeGuard] Same spike candle re-detected — cooldown timer preserved, NOT reset"
          );
        }
        break; // one spike is enough to activate cooldown
      }
    }

    const spikeElapsedMs   = now - spikeDetectedAt;
    const spikeCooldownMs  = SPIKE_COOLDOWN_COUNT * CANDLE_PRIMARY_MS;
    let inSpikeCooldown  = spikeDetectedAt > 0 && spikeElapsedMs < spikeCooldownMs;
    const spikeCooldownCandles = inSpikeCooldown
      ? Math.ceil((spikeCooldownMs - spikeElapsedMs) / CANDLE_PRIMARY_MS)
      : 0;

    // ── 1m trend (entry confirmation) ─────────────────────────────────────
    const ema9_1m  = calcEMA(closes1m, 9);
    const ema21_1m = calcEMA(closes1m, 21);
    const trendEntry  = detectTrend(ema9_1m, ema21_1m);
    const trendPrimary  = detectTrend(ema9_5m, ema21_5m);

    // ── FVG Detection (5m candles) ────────────────────────────────────────
    const volSma = calcVolumeSMA(candlesPrimary, 20);
    const fvgZones  = detectFVGZones(candlesPrimary, volSma);

    // ── Liquidity Sweep Detection (5m candles) ────────────────────────────
    const sweepDir  = detectLiquiditySweep(candlesPrimary, volSma);

    // ── Order Block Detection (5m candles, ATR-validated) ─────────────────
    const { bullishOB, bearishOB } = detectOrderBlocks(candlesPrimary, atr);

    // ── Reversal Confirmation Signals (5m candles) ────────────────────────
    // CHoCH: first structural break against the trend → earliest reversal signal
    // SweepRejection: wick beyond swing high/low + close back inside → institutional reversal
    const choch    = detectCHoCH(candlesPrimary, trendPrimary);
    const sweepRej = detectSweepRejection(candlesPrimary, atr);

    const isBullishSweep = sweepDir === "BULLISH" || sweepRej.rejectionType === "BULLISH";
    const isBearishSweep = sweepDir === "BEARISH" || sweepRej.rejectionType === "BEARISH";

    // ── Candlestick Pattern Detection (last 2 candles, ATR-scaled) ────────
    const candleResult = detectCandlePattern(candlesPrimary, atr);

    // ── Recent candle momentum (4 completed 5m candles, faster than EMA) ──
    // Penalty: -25 pts when recent momentum opposes the signal direction.
    // Bonus:   +10 pts when recent momentum confirms the direction.
    // Exception: neutralize penalty when confirmed institutional sweep/CHoCH reversal is present
    const recentMomentum     = getRecentMomentum(candlesPrimary);
    let longMomentumAdj      = recentMomentum === "BULLISH" ? 10
                             : recentMomentum === "BEARISH" ? -25 : 0;
    let shortMomentumAdj     = recentMomentum === "BEARISH" ? 10
                             : recentMomentum === "BULLISH" ? -25 : 0;

    if (isBullishSweep || (choch.detected && choch.direction === "BULLISH")) {
      if (longMomentumAdj < 0) longMomentumAdj = 0;
    }
    if (isBearishSweep || (choch.detected && choch.direction === "BEARISH")) {
      if (shortMomentumAdj < 0) shortMomentumAdj = 0;
    }

    logger.info(
      { recentMomentum, longMomentumAdj, shortMomentumAdj, isBullishSweep, isBearishSweep },
      "[MomentumGate] Recent 4-candle momentum"
    );

    // ── Scoring Engine ────────────────────────────────────────────────────
    // LONG scores
    let longEmaScore  = 0;
    let longRsiScore  = 0;
    let longMacdScore = 0;
    let longMomentum  = 0;

    if (ema9 > ema21) {
      longEmaScore = freshCross === "BULLISH" ? 35 : 20;
    }
    if      (rsi >= 40 && rsi <= 58) longRsiScore = 25;
    else if (rsi >= 35 && rsi <  40) longRsiScore = 18;
    else if (rsi >  58 && rsi <= 65) longRsiScore = 12;
    else if (rsi >  65 && rsi <= 75) longRsiScore = 6;  // strong trend: elevated but not extreme overbought
    // RSI > 75 = extreme overbought → no LONG credit (chasing exhaustion)

    if      (macdCrossBull)           longMacdScore = 25;
    else if (macdBullish)             longMacdScore = 20;
    else if (macdHist > 0)            longMacdScore = 10;
    // MACD line in positive territory but hist slightly negative (signal-line lag) = mild bullish
    else if (macdVal > 0) longMacdScore = 8;

    if      (trendEntry === "BULLISH") longMomentum = 15;
    else if (trendEntry === "NEUTRAL") longMomentum =  5;

    // SHORT scores
    let shortEmaScore  = 0;
    let shortRsiScore  = 0;
    let shortMacdScore = 0;
    let shortMomentum  = 0;

    if (ema9 < ema21) {
      shortEmaScore = freshCross === "BEARISH" ? 35 : 20;
    }
    if      (rsi >= 42 && rsi <= 60) shortRsiScore = 25;
    else if (rsi >  60 && rsi <= 65) shortRsiScore = 18;
    // Overbought RSI only means reversal potential when EMA is NOT bullishly aligned.
    // In a bull trend (ema9 > ema21) high RSI = trend strength, not exhaustion.
    else if (rsi >  65 && rsi <= 80 && ema9 <= ema21) shortRsiScore = 18;
    else if (rsi >= 35 && rsi <  42) shortRsiScore = 12;

    if      (macdCrossBear)    shortMacdScore = 25;
    else if (macdBearish)      shortMacdScore = 20;
    else if (macdHist < 0)     shortMacdScore = 10;

    if      (trendEntry === "BEARISH") shortMomentum = 15;
    else if (trendEntry === "NEUTRAL") shortMomentum =  5;

    // FVG scores (direction-dependent)
    const longFvgScore  = getFVGScore(currentPrice, fvgZones, "LONG");
    const shortFvgScore = getFVGScore(currentPrice, fvgZones, "SHORT");

    // Liquidity sweep scores (direction-dependent)
    const longSweepScore  = isBullishSweep ? (sweepRej.isStrong ? 35 : 30) : 0;
    const shortSweepScore = isBearishSweep ? (sweepRej.isStrong ? 35 : 30) : 0;

    // Order Block scores (direction-dependent — bullish OB confirms LONG, bearish OB confirms SHORT)
    const longObScore  = getOBScore(bullishOB);
    const shortObScore = getOBScore(bearishOB);

    // ── Two-candle confirmation for single-candle patterns ────────────────
    // Hammer / Shooting Star / Doji: store as pending on detection; only score
    // after the NEXT candle closes in the expected reversal direction.
    // Engulfing patterns: two-candle by nature — context must be valid; immediate.
    const formingCandleTime = candlesPrimary[candlesPrimary.length - 1]?.time ?? 0;

    // Step 1: resolve any previously pending pattern
    let confirmedCandleResult: typeof candleResult | null = null;
    let confirmationStatus: "confirmed" | "pending_confirmation" | "not_applicable" | null = null;

    if (pendingPattern !== null) {
      if (formingCandleTime !== pendingPattern.formingCandleTime) {
        // A new 5m bar has started — the detection candle is now fully closed.
        // The "follow-through" candle is candlesPrimary[length-2] (last completed).
        const followThrough = candlesPrimary[candlesPrimary.length - 2];
        if (followThrough) {
          const bullOk = pendingPattern.bias === "BULLISH" && followThrough.close > pendingPattern.detectedClose;
          const bearOk = pendingPattern.bias === "BEARISH" && followThrough.close < pendingPattern.detectedClose;
          if (bullOk || bearOk) {
            confirmedCandleResult = {
              pattern:         pendingPattern.pattern,
              bias:            pendingPattern.bias,
              patternStrength: pendingPattern.patternStrength,
              contextValid:    pendingPattern.contextValid,
              confluenceMet:   pendingPattern.confluenceMet,
            };
            confirmationStatus = "confirmed";
            logger.info({ pattern: pendingPattern.pattern, bias: pendingPattern.bias }, "[PatternConfirm] Follow-through confirmed");
          } else {
            logger.info({ pattern: pendingPattern.pattern, bias: pendingPattern.bias }, "[PatternConfirm] Follow-through disconfirmed — discarded");
          }
        }
        pendingPattern = null; // clear regardless
      } else {
        // Same forming bar — still waiting
        confirmationStatus = "pending_confirmation";
      }
    }

    // Step 2: process the currently detected pattern
    if (candleResult.pattern !== null && candleResult.bias !== null) {
      const needsConfirmation = SINGLE_CANDLE_PATTERNS.has(candleResult.pattern);
      if (!needsConfirmation) {
        // Engulfing — self-confirming; use immediately if context is valid
        if (candleResult.contextValid) {
          confirmedCandleResult = candleResult;
          confirmationStatus    = "not_applicable";
          pendingPattern        = null;
        } else {
          // Context invalid engulfing: visible in logs/UI but excluded from scoring
          if (confirmationStatus === null) confirmationStatus = "not_applicable";
          logger.info(
            { pattern: candleResult.pattern, contextValid: false },
            "[PatternConfirm] Engulfing detected but context invalid — excluded from scoring"
          );
        }
      } else if (pendingPattern === null) {
        // New single-candle pattern — store as pending for next bar
        pendingPattern = {
          pattern:           candleResult.pattern,
          bias:              candleResult.bias,
          patternStrength:   candleResult.patternStrength,
          contextValid:      candleResult.contextValid,
          confluenceMet:     candleResult.confluenceMet,
          formingCandleTime,
          detectedClose:     candlesPrimary[candlesPrimary.length - 1]?.close ?? 0,
        };
        if (confirmationStatus === null) confirmationStatus = "pending_confirmation";
        logger.info({ pattern: candleResult.pattern, bias: candleResult.bias, strength: candleResult.patternStrength, contextValid: candleResult.contextValid }, "[PatternConfirm] Stored as pending — awaiting next-candle confirmation");
      }
    }

    // Candlestick pattern scores — only confirmed patterns score.
    // Score is SCALED by patternStrength (0-100): a weak pattern contributes less.
    // Confirming: up to +20 pts; opposing: up to -10 pts.
    const activeBias     = confirmedCandleResult?.bias            ?? null;
    const activeStrength = confirmedCandleResult?.patternStrength ?? 0;
    const longCandleScore  = activeBias === "BULLISH" ? Math.round(20 * activeStrength / 100)
                           : activeBias === "BEARISH" ? Math.round(-10 * activeStrength / 100)
                           : 0;
    const shortCandleScore = activeBias === "BEARISH" ? Math.round(20 * activeStrength / 100)
                           : activeBias === "BULLISH" ? Math.round(-10 * activeStrength / 100)
                           : 0;

    // Raw totals — include recent 4-candle momentum adjustment:
    //   +10 if momentum confirms the direction (faster than EMA cross)
    //   -25 if momentum opposes the direction (prevents LONG into a bearish wave)
    const longRaw  = Math.max(0, longEmaScore  + longRsiScore  + longMacdScore  + longMomentum  + longFvgScore  + longSweepScore  + longObScore  + longCandleScore  + longMomentumAdj);
    const shortRaw = Math.max(0, shortEmaScore + shortRsiScore + shortMacdScore + shortMomentum + shortFvgScore + shortSweepScore + shortObScore + shortCandleScore + shortMomentumAdj);

    // Normalize to 0-100 for display and threshold comparison
    let longNorm  = Math.min(100, Math.round((longRaw  / MAX_RAW_SCORE) * 100));
    let shortNorm = Math.min(100, Math.round((shortRaw / MAX_RAW_SCORE) * 100));

    // ── High-Precision Accuracy Guards (Prevent buying tops / selling bottoms) ──
    // ── Market Structure & Range Analysis (Move these UP so we can use them in the guards) ──
    const ms5m = detectMarketStructure(candlesPrimary);
    const msMacro = detectMarketStructure(candlesMacro);
    const rangeInfo = analyzeMarketRange(candlesPrimary, currentPrice, atr, 30);
    const isMarketConsolidating = ms5m.structure === "RANGING" || trendPrimary === "NEUTRAL" || currentAdx < 18;

    // RSI Guard for LONGs:
    // If macro is Bearish/Ranging, don't buy if RSI > 65. If Bullish, allow up to 75.
    const maxLongRSI = ((msMacro.structure === "UPTREND" || trendMacro === "BULLISH") && trendPrimary === "BULLISH") ? 75 : 65;
    if (rsi > maxLongRSI) {
      longNorm = 0;
      logger.info({ rsi, maxLongRSI }, `[AccuracyGuard] Overbought RSI (>${maxLongRSI}) — LONG signals suppressed`);
    }

    // RSI Guard for SHORTs:
    // If macro is Bullish/Ranging, don't short if RSI < 42 (prevent selling dips). 
    // If Bearish, allow shorting until RSI drops below 28 (extreme oversold).
    const minShortRSI = ((msMacro.structure === "DOWNTREND" || trendMacro === "BEARISH") && trendPrimary === "BEARISH") ? 28 : 42;
    if (rsi < minShortRSI) {
      shortNorm = 0;
      logger.info({ rsi, minShortRSI }, `[AccuracyGuard] Oversold RSI (<${minShortRSI}) — SHORT signals suppressed to prevent whipsaws`);
    }

    // MACD momentum expansion check: require momentum confirmation
    if (macdBullish === false && macdHist < 0 && longNorm > 0) {
      longNorm = Math.max(0, longNorm - 15);
    }
    if (macdBearish === false && macdHist > 0 && shortNorm > 0) {
      shortNorm = Math.max(0, shortNorm - 15);
    }

    // In ranging/chop conditions (ADX < 22 or NEUTRAL/RANGING structure), require higher base confidence (70% vs 53%)
    const baseMinConf = isMarketConsolidating ? MIN_CONF_RANGE : MIN_CONF_NORMAL;
    const dynamicMinConf = smartMode && analytics.sufficientData ? baseMinConf + 5 : baseMinConf;

    // HTF Alignment Guard: Never short if the 15m structural trend is BULLISH
    if (shortNorm >= dynamicMinConf && (msMacro.structure === "UPTREND" || trendMacro === "BULLISH")) {
        shortNorm = Math.max(0, shortNorm - 25);
        logger.info("[AccuracyGuard] HTF (15m) structure is UPTREND — penalizing SHORT score");
    }
    if (longNorm >= dynamicMinConf && (msMacro.structure === "DOWNTREND" || trendMacro === "BEARISH")) {
        longNorm = Math.max(0, longNorm - 25);
        logger.info("[AccuracyGuard] HTF (15m) structure is DOWNTREND — penalizing LONG score");
    }

    // ── Per-direction minimum confidence (consecutive-stop circuit breaker) ──
    // After ≥2 stops in the same direction from recent trades, require an extra 15% confidence
    const circuitBreakerPenalty = 15;
    const longMinConf  = recentStops.longStops  >= 2 ? dynamicMinConf + circuitBreakerPenalty : dynamicMinConf;
    const shortMinConf = recentStops.shortStops >= 2 ? dynamicMinConf + circuitBreakerPenalty : dynamicMinConf;
    if (recentStops.longStops >= 2 || recentStops.shortStops >= 2) {
      logger.warn(
        { longStops: recentStops.longStops, shortStops: recentStops.shortStops, longMinConf, shortMinConf },
        "[CircuitBreaker] Consecutive stops detected — confidence threshold raised"
      );
    }

    // ── Determine direction ───────────────────────────────────────────────
    let direction: "LONG" | "SHORT" | "HOLD" = "HOLD";

    if (longNorm >= shortNorm && longNorm >= longMinConf) {
      direction = "LONG";
    } else if (shortNorm > longNorm && shortNorm >= shortMinConf) {
      direction = "SHORT";
    }

    // Always show the dominant direction's scores (even for HOLD)
    const dominant = longNorm >= shortNorm ? "LONG" : "SHORT";
    const emaScore      = dominant === "LONG" ? longEmaScore  : shortEmaScore;
    const rsiScore      = dominant === "LONG" ? longRsiScore  : shortRsiScore;
    const macdScore     = dominant === "LONG" ? longMacdScore : shortMacdScore;
    const momentumScore = dominant === "LONG" ? longMomentum  : shortMomentum;
    const fvgScore      = dominant === "LONG" ? longFvgScore    : shortFvgScore;
    const sweepScore    = dominant === "LONG" ? longSweepScore  : shortSweepScore;
    const obScore       = dominant === "LONG" ? longObScore     : shortObScore;
    const candleScore   = dominant === "LONG" ? longCandleScore : shortCandleScore;

    // Display: confirmed pattern name, "(pending)" suffix when awaiting confirmation,
    // or null when no pattern is active. The raw `patternDetected` field is always
    // the bare name without any suffix.
    const patternDetected = confirmedCandleResult?.pattern ?? pendingPattern?.pattern ?? candleResult.pattern ?? null;
    const candlePattern   = confirmedCandleResult?.pattern
      ? (confirmationStatus === "confirmed" ? `${confirmedCandleResult.pattern} ✓` : confirmedCandleResult.pattern)
      : pendingPattern?.pattern ? `${pendingPattern.pattern} ⏳` : null;
    const patternStrength     = confirmedCandleResult?.patternStrength ?? pendingPattern?.patternStrength ?? 0;
    const contextValid        = confirmedCandleResult?.contextValid    ?? pendingPattern?.contextValid    ?? false;
    const confluenceMet       = confirmedCandleResult?.confluenceMet   ?? false;

    let confidence = direction !== "HOLD"
      ? (direction === "LONG" ? longNorm : shortNorm)
      : Math.max(longNorm, shortNorm);

    let signalStrength: "STRONG" | "NORMAL" | null =
      direction !== "HOLD" && confidence >= MIN_CONF_STRONG ? "STRONG" :
      direction !== "HOLD" && confidence >= MIN_CONF_NORMAL ? "NORMAL" :
      null;

    // ── Cooldown Guard ────────────────────────────────────────────────────
    // Layer 1 — Hard 5-minute floor (absolute minimum, no bypass).
    let hardFloorActive = sinceLastSignal < MIN_SIGNAL_INTERVAL_MS;

    // Layer 2 — Standard 15-minute cooldown (bypassable only when price
    //   moved ≥0.2% AND the signal is in the opposite direction).
    let inCooldown     = sinceLastSignal < COOLDOWN_MS;
    const priceMoved     = lastSignalState
      ? Math.abs(currentPrice - lastSignalState.price) / lastSignalState.price >= MIN_PRICE_MOVE_PCT
      : true;
    const oppositeSignal = lastSignalState &&
      direction !== "HOLD" && direction !== lastSignalState.signal;

    let finalSignal = direction;
    let suppressionReason = "";

    if (finalSignal !== "HOLD" && hardFloorActive) {
      logger.info(
        { msSinceLast: sinceLastSignal, floorMs: MIN_SIGNAL_INTERVAL_MS },
        "[Cooldown] Hard 5-min floor active — signal suppressed"
      );
      finalSignal = "HOLD";
      suppressionReason = "Hard 5-min floor active";
    } else if (finalSignal !== "HOLD" && inCooldown && !(priceMoved && oppositeSignal)) {
      finalSignal = "HOLD";
      suppressionReason = "Cooldown active";
    }
    // Post-spike cooldown overrides all — no signals until spike settles
    if (finalSignal !== "HOLD" && inSpikeCooldown) {
      finalSignal = "HOLD";
      suppressionReason = "Spike cooldown active";
    }

    // ── Global Circuit Breaker Protection (45-min window after 2+ losses) ──
    // Uncompromising capital preservation: Absolutely ZERO signals allowed during circuit breaker cooldown
    if (recentStops.inCircuitBreakerCooldown) {
      if (finalSignal !== "HOLD") {
        logger.warn(
          { consecutiveLosses: recentStops.consecutiveLosses, cooldownMins: recentStops.cooldownRemainingMinutes, suppressedSignal: finalSignal },
          "[CircuitBreaker] Hard Halt: Signal strictly suppressed by circuit breaker cooldown"
        );
      }
      finalSignal = "HOLD";
      confidence = 0;
      signalStrength = null;
      suppressionReason = `Circuit Breaker active (${recentStops.cooldownRemainingMinutes}m left)`;
    }

    // ── Directional Circuit Breaker Protection (Halt buying in dumps or selling in rallies) ──
    if (finalSignal === "LONG" && recentStops.longDirectionCooldown) {
      logger.warn(
        { longLosses2h: recentStops.longLosses2h, longNetPnl2h: recentStops.longNetPnl2h, cooldownMins: recentStops.directionalCooldownRemainingMinutes },
        "[CircuitBreaker] Directional Halt: LONG entries suppressed due to repetitive LONG losses"
      );
      finalSignal = "HOLD";
      confidence = 0;
      signalStrength = null;
      suppressionReason = `Directional Circuit Breaker: LONG entries halted (${recentStops.directionalCooldownRemainingMinutes}m left after losses)`;
    } else if (finalSignal === "SHORT" && recentStops.shortDirectionCooldown) {
      logger.warn(
        { shortLosses2h: recentStops.shortLosses2h, shortNetPnl2h: recentStops.shortNetPnl2h, cooldownMins: recentStops.directionalCooldownRemainingMinutes },
        "[CircuitBreaker] Directional Halt: SHORT entries suppressed due to repetitive SHORT losses"
      );
      finalSignal = "HOLD";
      confidence = 0;
      signalStrength = null;
      suppressionReason = `Directional Circuit Breaker: SHORT entries halted (${recentStops.directionalCooldownRemainingMinutes}m left after losses)`;
    }

    // ── DB Deduplication Guard (Prevents redundant signals if trade is already running) ──
    if (finalSignal !== "HOLD") {
      try {
        const running = await getRunningTrades();
        if (running.length > 0) {
          logger.info({ direction: finalSignal, runningTrade: running[0].signal }, "[SignalEngine] RUNNING trade already open — signal suppressed");
          finalSignal = "HOLD";
          suppressionReason = `RUNNING trade already open (${running[0].signal})`;
        } else {
          const latest = await getLatestSignal();
          if (latest && latest.signal === finalSignal) {
            const timeSinceLatest = Date.now() - latest.createdAt.getTime();
            if (timeSinceLatest < 5 * 60 * 1000) {
              logger.info({ direction: finalSignal, msAgo: timeSinceLatest }, "[SignalEngine] Previous signal in same direction fired within 5 mins — signal suppressed");
              finalSignal = "HOLD";
              suppressionReason = "Previous signal in same direction fired within 5 mins";
            }
          }
        }
      } catch (dbErr) {
        logger.warn({ err: dbErr }, "[SignalEngine] Failed to check DB for running trades");
      }
    }

    // ── TP Exhaustion Guard (Prevents chasing after a massive win) ──
    if (finalSignal !== "HOLD" && recentStops.lastWinTime > 0) {
      const timeSinceBigWin = Date.now() - recentStops.lastWinTime;
      // If we had a massive win (> 5.0 pts) in the SAME direction within the last 60 minutes
      if (recentStops.lastWinDirection === finalSignal && timeSinceBigWin < 60 * 60 * 1000) {
        logger.warn(
          { finalSignal, pnl: recentStops.lastWinPnl, minsAgo: Math.round(timeSinceBigWin / 60000) },
          "[Macro Gate] TP Exhaustion Halt: Suppressed signal to prevent chasing an exhausted move right after a massive profit."
        );
        finalSignal = "HOLD";
        confidence = 0;
        signalStrength = null;
        suppressionReason = `TP Exhaustion Cooldown: Wait for pullback. Massive +${recentStops.lastWinPnl.toFixed(1)}pt ${recentStops.lastWinDirection} win was just secured ${Math.round(timeSinceBigWin / 60000)}m ago.`;
      }
    }

    // ── Reversal Classification & Gate ────────────────────────────────────
    const emaDirection: "BULLISH" | "BEARISH" | "NEUTRAL" =
      ema9 > ema21 * 1.0005 ? "BULLISH" :
      ema9 < ema21 * 0.9995 ? "BEARISH" :
      "NEUTRAL";

    const effectiveTrend =
      trendPrimary !== "NEUTRAL" ? trendPrimary :
      emaDirection !== "NEUTRAL" ? emaDirection :
      "NEUTRAL";

    const intendedSignal = direction !== "HOLD" ? direction : (longNorm >= shortNorm ? "LONG" : "SHORT");


    const isAgainstTrend =
      (intendedSignal === "LONG"  && effectiveTrend === "BEARISH") ||
      (intendedSignal === "SHORT" && effectiveTrend === "BULLISH");

    // -- True vs False Breakout Logic --
    let isTrueBreakout = false;
    let isFalseBreakout = false;
    
    if (isMarketConsolidating && rangeInfo.isRanging ) {
      const breakoutBuffer = atr * 0.2;
      
      // True Breakout: Price pushes cleanly beyond the boundary with momentum
      if (intendedSignal === "LONG" && currentPrice > (rangeInfo.resistance + breakoutBuffer) && macdHist > 0 && rsi > 55) {
        isTrueBreakout = true;
      } else if (intendedSignal === "SHORT" && currentPrice < (rangeInfo.support - breakoutBuffer) && macdHist < 0 && rsi < 45) {
        isTrueBreakout = true;
      }
      
      // False Breakout (Sweep Rejection): Swept liquidity outside boundary but rejected back in
      if (intendedSignal === "LONG" && sweepRej.detected && sweepRej.rejectionType === "BULLISH" && sweepRej.sweptLevel !== null && sweepRej.sweptLevel <= rangeInfo.support) {
        isFalseBreakout = true;
      } else if (intendedSignal === "SHORT" && sweepRej.detected && sweepRej.rejectionType === "BEARISH" && sweepRej.sweptLevel !== null && sweepRej.sweptLevel >= rangeInfo.resistance) {
        isFalseBreakout = true;
      }
    }


    let signalType: "TREND_FOLLOW" | "REVERSAL" | "RANGE" | "BREAKOUT" = (isMarketConsolidating && rangeInfo.isRanging) ? "RANGE" : isAgainstTrend ? "REVERSAL" : "TREND_FOLLOW";

    if (finalSignal !== "HOLD" && isAgainstTrend) {
      if (isFalseBreakout) {
         logger.info({ finalSignal }, "[Breakout] False breakout (Sweep Rejection) detected. Allowing reversal trade.");
      } else {
        // Allow reversal trades if confidence is high enough
        logger.info({ finalSignal }, "[MacroFilter] Allowing reversal trade (counter-trend).");
      }
    }
    
    // NEW STRICT MACRO-TREND FILTER
    if (finalSignal !== "HOLD" && effectiveTrend === "NEUTRAL") {
      if (isTrueBreakout) {
        logger.info({ finalSignal }, "[Breakout] True breakout detected. Bypassing NEUTRAL trend filter.");
      } else if (isFalseBreakout) {
        logger.info({ finalSignal }, "[Breakout] False breakout detected. Bypassing NEUTRAL trend filter.");
      } else if (signalType === "RANGE") {
        logger.info({ finalSignal }, "[MacroFilter] Range trade detected. Bypassing NEUTRAL trend filter.");
      } else {
        logger.warn({ finalSignal }, "[MacroFilter] Suppressed because effective trend is NEUTRAL");
        finalSignal = "HOLD";
        suppressionReason = "Strict macro-trend requirement: Market is currently NEUTRAL";
      }
    }

    
    // ── STRICT CHOP/SIDEWAYS FILTER ───────────────────────────────────────
    // If the market is consolidating (ADX < 20) or ranging, completely disable trading,
    // UNLESS it is a clean range boundary bounce/breakout.
    
    // [DEBUG CHOP]
    logger.info({
        adx: currentAdx,
        isRanging: rangeInfo.isRanging,
        position: rangeInfo.position,
        currentPrice
    }, "[Chop Filter Status]");
    
    if (finalSignal !== "HOLD" && currentAdx < 20 && !rangeInfo.isRanging) {
      logger.warn({ currentAdx, finalSignal }, "[ChopFilter] Suppressing signal in pure chop (ADX < 20, no clear range).");
      finalSignal = "HOLD";
      suppressionReason = "Market is in pure chop (ADX < 20, no clean range). Waiting for momentum or boundaries.";
    }

    // ── Range Boundaries & Mid-Chop Gate ──────────────────────────────────
    // In consolidation/ranging conditions, reject trend-following breakouts in the middle of chop
    // and prevent buying into range resistance or selling into range support.
    if (finalSignal !== "HOLD" && isMarketConsolidating && rangeInfo.isRanging) {
      if (rangeInfo.position === "MID_CHOP_ZONE") {
        logger.warn({ rangeInfo, finalSignal }, "[RangeFilter] Suppressing signal in MID_CHOP_ZONE.");
        finalSignal = "HOLD";
        suppressionReason = `Range consolidation ($${rangeInfo.support.toFixed(1)} – $${rangeInfo.resistance.toFixed(1)}) · Price in middle chop zone (waiting for boundary test)`;
      } else if (rangeInfo.position === "RESISTANCE_ZONE" && finalSignal === "LONG" && !isTrueBreakout) {
        logger.warn({ rangeInfo, finalSignal }, "[RangeFilter] Suppressing LONG into Resistance (False Breakout trap).");
        finalSignal = "HOLD";
        suppressionReason = `Range consolidation ($${rangeInfo.support.toFixed(1)} – $${rangeInfo.resistance.toFixed(1)}) · Cannot BUY into Resistance without a confirmed True Breakout`;
      } else if (rangeInfo.position === "SUPPORT_ZONE" && finalSignal === "SHORT" && !isTrueBreakout) {
        logger.warn({ rangeInfo, finalSignal }, "[RangeFilter] Suppressing SHORT into Support (False Breakdown trap).");
        finalSignal = "HOLD";
        suppressionReason = `Range consolidation ($${rangeInfo.support.toFixed(1)} – $${rangeInfo.resistance.toFixed(1)}) · Cannot SELL into Support without a confirmed True Breakout`;
      } else {
        logger.info({ rangeInfo, finalSignal, isTrueBreakout }, "[RangeFilter] Range trade validated and allowed at boundary.");
      }
    }

    // ── 1-HOUR & 15-MINUTE MULTI-TIMEFRAME MACRO TREND GATE (Drawdown Killer) ──
    // Determine macro regime using confirmed alignment between price & 1H EMAs.
    let macro1hState: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    const emaAlignedBullish1h = (lastEma20_1h > lastEma50_1h && currentPrice >= lastEma50_1h) || (trend1h === "BULLISH" && currentPrice > lastEma20_1h);
    const emaAlignedBearish1h = (lastEma20_1h < lastEma50_1h && currentPrice <= lastEma50_1h) || (trend1h === "BEARISH" && currentPrice < lastEma20_1h);

    if (emaAlignedBullish1h && !emaAlignedBearish1h && ms1h.structure !== "DOWNTREND") {
      macro1hState = "BULLISH";
    } else if (emaAlignedBearish1h && !emaAlignedBullish1h && ms1h.structure !== "UPTREND") {
      macro1hState = "BEARISH";
    } else {
      // Conflicting signals or transitional phase -> Market is in 1H transition/consolidation
      macro1hState = "NEUTRAL";
    }

    if (finalSignal !== "HOLD") {
      // 1. Strict Multi-Timeframe Cascade Blocker (Major Drawdown Killer):
      // When 1H and 15m are both aligned bearish or in a downtrend, ALL LONG trades (TREND_FOLLOW, RANGE, REVERSAL) are strictly FORBIDDEN!
      const priceBullish1h = currentPrice > lastEma20_1h && currentPrice > lastEma50_1h;
      const priceBearish1h = currentPrice < lastEma20_1h && currentPrice < lastEma50_1h;
      const priceBullishMacro = currentPrice > ema9 && currentPrice > ema21; // 15m price structure
      const priceBearishMacro = currentPrice < ema9 && currentPrice < ema21; // 15m price structure

      const isMultiTimeframeBearish = (macro1hState === "BEARISH" || trend1h === "BEARISH" || ms1h.structure === "DOWNTREND" || priceBearish1h) &&
                                      (trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND" || priceBearishMacro);
      const isMultiTimeframeBullish = (macro1hState === "BULLISH" || trend1h === "BULLISH" || ms1h.structure === "UPTREND" || priceBullish1h) &&
                                      (trendMacro === "BULLISH" || msMacro.structure === "UPTREND" || priceBullishMacro);

      if (finalSignal === "LONG" && isMultiTimeframeBearish) {
        logger.warn(
          { finalSignal, signalType, macro1hState, trend1h, trendMacro, msMacro: msMacro.structure, currentPrice },
          "[Macro Cascade Gate] Suppressed LONG: 1H & 15m are aligned BEARISH (No counter-trend buying in waterfalls!)"
        );
        finalSignal = "HOLD";
        suppressionReason = "Strict Multi-Timeframe Cascade Gate: Cannot BUY when 1H & 15m are in confirmed downtrend";
      } else if (finalSignal === "SHORT" && isMultiTimeframeBullish) {
        logger.warn(
          { finalSignal, signalType, macro1hState, trend1h, trendMacro, msMacro: msMacro.structure, currentPrice },
          "[Macro Cascade Gate] Suppressed SHORT: 1H & 15m are aligned BULLISH (No counter-trend selling in rallies!)"
        );
        finalSignal = "HOLD";
        suppressionReason = "Strict Multi-Timeframe Cascade Gate: Cannot SELL when 1H & 15m are in confirmed uptrend";
      }

      // 2. Severe EMA Distance / Overextension Protection (Falling Knife & Late Chaser Guard):
      if (finalSignal === "LONG" && (macro1hState === "BEARISH" || trend1h === "BEARISH" || priceBearish1h) && (lastEma20_1h - currentPrice) > Math.max(atr * 2.0, 5.0)) {
        logger.warn(
          { finalSignal, currentPrice, ema20_1h: +lastEma20_1h.toFixed(2), diff: +(lastEma20_1h - currentPrice).toFixed(2) },
          "[Macro Gate] Suppressed LONG: Falling knife protection — price is severely below 1H EMA20 in a downtrend"
        );
        finalSignal = "HOLD";
        suppressionReason = "Falling Knife Protection: Price severely below 1H EMA20 in downtrend";
      } else if (finalSignal === "SHORT" && (macro1hState === "BULLISH" || trend1h === "BULLISH" || priceBullish1h) && (currentPrice - lastEma20_1h) > Math.max(atr * 2.0, 5.0)) {
        logger.warn(
          { finalSignal, currentPrice, ema20_1h: +lastEma20_1h.toFixed(2), diff: +(currentPrice - lastEma20_1h).toFixed(2) },
          "[Macro Gate] Suppressed SHORT: Rocket rally protection — price is severely above 1H EMA20 in an uptrend"
        );
        finalSignal = "HOLD";
        suppressionReason = "Rocket Rally Protection: Price severely above 1H EMA20 in uptrend";
      } else if (signalType === "TREND_FOLLOW") {
        const lastCandle = candlesPrimary.length >= 2 ? candlesPrimary[candlesPrimary.length - 2] : null;
        const prevCandle = candlesPrimary.length >= 3 ? candlesPrimary[candlesPrimary.length - 3] : null;

        // Exhaustion Rejection Filter: Detect shooting stars / long upper wicks at local highs or hammers at local lows
        const localHigh10 = Math.max(...candlesPrimary.slice(-10).map(c => c.high));
        const localLow10  = Math.min(...candlesPrimary.slice(-10).map(c => c.low));

        const isUpperRejection = (c: any) => {
          if (!c) return false;
          const range = Math.max(0.1, c.high - c.low);
          const upperWick = c.high - Math.max(c.open, c.close);
          return (upperWick / range >= 0.40 && upperWick >= 1.2);
        };

        const isLowerRejection = (c: any) => {
          if (!c) return false;
          const range = Math.max(0.1, c.high - c.low);
          const lowerWick = Math.min(c.open, c.close) - c.low;
          return (lowerWick / range >= 0.40 && lowerWick >= 1.2);
        };

        const recentUpperRejection = isUpperRejection(lastCandle) || isUpperRejection(prevCandle);
        const recentLowerRejection = isLowerRejection(lastCandle) || isLowerRejection(prevCandle);

        if (finalSignal === "LONG" && recentUpperRejection && (localHigh10 - currentPrice) < Math.max(atr * 0.8, 3.5)) {
          logger.warn(
            { finalSignal, currentPrice, localHigh10 },
            "[Macro Gate] Suppressed LONG: Exhaustion upper-wick rejection detected at local high. Buying into resistance/distribution blocked."
          );
          finalSignal = "HOLD";
          suppressionReason = "Exhaustion Rejection: Stalling with upper wicks at highs. Buying into resistance/distribution blocked.";
        } else if (finalSignal === "SHORT" && recentLowerRejection && (currentPrice - localLow10) < Math.max(atr * 0.8, 3.5)) {
          logger.warn(
            { finalSignal, currentPrice, localLow10 },
            "[Macro Gate] Suppressed SHORT: Exhaustion lower-wick rejection detected at local low. Selling into support/absorption blocked."
          );
          finalSignal = "HOLD";
          suppressionReason = "Exhaustion Rejection: Stalling with lower wicks at lows. Selling into support/absorption blocked.";
        }

        // Extreme momentum requires true runaway trend (ADX > 38) and RSI not exhausted
        const isExtremeMomentumLong = currentAdx > 38 && macdHist > 0 && rsi < 75 && !recentUpperRejection;
        const isExtremeMomentumShort = currentAdx > 38 && macdHist < 0 && rsi > 25 && !recentLowerRejection;
        
        // Prevent "late to the party" chasing (selling the bottom or buying the top)
        if (finalSignal === "SHORT" && (lastEma20_1h - currentPrice) > Math.max(atr * 0.6, 8.0)) {
            if (isExtremeMomentumShort) {
                logger.info({ finalSignal, currentAdx, currentPrice }, "[Macro Gate] Extreme momentum detected. Bypassing overextension block to catch the waterfall.");
            } else {
            logger.warn(
                { finalSignal, currentPrice, ema20_1h: +lastEma20_1h.toFixed(2) },
                "[Macro Gate] Suppressed SHORT Trend Follow: Price is overextended downside (> ATR*0.6 below 1H EMA20). Wait for pullback."
            );
            finalSignal = "HOLD";
            suppressionReason = "Overextended downside: Price too far below 1H EMA20 to short safely. (Wait for pullback)";
            }
        } else if (finalSignal === "LONG" && (currentPrice - lastEma20_1h) > Math.max(atr * 0.6, 8.0)) {
            if (isExtremeMomentumLong) {
                logger.info({ finalSignal, currentAdx, currentPrice }, "[Macro Gate] Extreme momentum detected. Bypassing overextension block to catch the rocket.");
            } else {
            logger.warn(
                { finalSignal, currentPrice, ema20_1h: +lastEma20_1h.toFixed(2) },
                "[Macro Gate] Suppressed LONG Trend Follow: Price is overextended upside (> ATR*0.6 above 1H EMA20). Wait for pullback."
            );
            finalSignal = "HOLD";
            suppressionReason = "Overextended upside: Price too far above 1H EMA20 to long safely. (Wait for pullback)";
            }
        }
      }

      // 3. Strict blocking for Trend-Following Trades: Never trend-follow against 1H macro or 15m structure
      if (finalSignal !== "HOLD" && signalType === "TREND_FOLLOW") {
        const priceBullish1h = currentPrice > lastEma20_1h && currentPrice > lastEma50_1h;
        const priceBearish1h = currentPrice < lastEma20_1h && currentPrice < lastEma50_1h;
        
        const htBearish = macro1hState === "BEARISH" || trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND" || priceBearish1h;
        const htBullish = macro1hState === "BULLISH" || trendMacro === "BULLISH" || msMacro.structure === "UPTREND" || priceBullish1h;

        // Bypassing logic: If there's high confidence (e.g., > 75%) and a strong sweep, 
        // we might allow it even if HTF is slightly against it, but generally we block.
        // For now, let's keep it strict but make the reason clearer.
        if (finalSignal === "LONG" && htBearish) {
          logger.warn(
            { finalSignal, macro1hState, trend1h, trendMacro, msMacro: msMacro.structure },
            "[Macro Gate] Suppressed LONG trend-follow: Higher timeframe structure is BEARISH"
          );
          finalSignal = "HOLD";
          suppressionReason = `Strict Macro Gate: Cannot BUY trend-follow. (1H: ${macro1hState}, 15m: ${trendMacro}, 15m MS: ${msMacro.structure})`;
        } else if (finalSignal === "SHORT" && htBullish) {
          logger.warn(
            { finalSignal, macro1hState, trend1h, trendMacro, msMacro: msMacro.structure },
            "[Macro Gate] Suppressed SHORT trend-follow: Higher timeframe structure is BULLISH"
          );
          finalSignal = "HOLD";
          suppressionReason = `Strict Macro Gate: Cannot SELL trend-follow. (1H: ${macro1hState}, 15m: ${trendMacro}, 15m MS: ${msMacro.structure})`;
        }
      }

      // 4. High-Confluence Requirement for Counter-Macro Range & Reversal Trades (when 15m is NOT in cascade)
      // If higher timeframes are trending strongly (ADX > 25), range mean-reversion trades are forbidden!
      if (finalSignal !== "HOLD" && (signalType === "RANGE" || signalType === "REVERSAL")) {
        const priceBullish1h = currentPrice > lastEma20_1h && currentPrice > lastEma50_1h;
        const priceBearish1h = currentPrice < lastEma20_1h && currentPrice < lastEma50_1h;
        const isCounterTo1hOr15m = 
            (finalSignal === "LONG" && (macro1hState === "BEARISH" || trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND" || priceBearish1h)) ||
            (finalSignal === "SHORT" && (macro1hState === "BULLISH" || trendMacro === "BULLISH" || msMacro.structure === "UPTREND" || priceBullish1h));
            
        // Strict guard against the immediate 5m trend
        const isCounterTo5mTrend = 
            (finalSignal === "LONG" && effectiveTrend === "BEARISH") ||
            (finalSignal === "SHORT" && effectiveTrend === "BULLISH");
        
        if (isCounterTo1hOr15m || isCounterTo5mTrend) {
          if (currentAdx > 25) {
            logger.warn(
              { finalSignal, signalType, currentAdx, macro1hState, trendMacro, effectiveTrend },
              "[Macro Gate] Counter-trend trade suppressed: ADX > 25 indicates strong trending market (mean reversion blocked)"
            );
            finalSignal = "HOLD";
            suppressionReason = `Counter-Trend trade blocked: ADX (${currentAdx.toFixed(1)}) indicates strong trending market`;
          } else {
            const hasSweepConfirmation = sweepRej.detected || sweepScore > 0 || isFalseBreakout;
            const minCounterConf = 78;

            if (confidence < minCounterConf || !hasSweepConfirmation) {
              logger.warn(
                { finalSignal, signalType, confidence, minCounterConf, macro1hState, trendMacro, effectiveTrend, hasSweepConfirmation },
                "[Macro Gate] Counter-trend range/reversal suppressed due to insufficient confidence or lack of sweep"
              );
              finalSignal = "HOLD";
              suppressionReason = `Counter-Trend trade requires confirmed sweep rejection and ≥${minCounterConf}% confidence (got ${confidence}%)`;
            } else {
              logger.info(
                { finalSignal, signalType, confidence, macro1hState, trendMacro, effectiveTrend, hasSweepConfirmation },
                "[Macro Gate] Counter-trend setup validated with high confluence"
              );
            }
          }
        }
      }
    }

    // ── Volatility Filter (Prevent "Death by a Thousand Cuts" in Choppy/Flat Markets) ──
    if (finalSignal !== "HOLD") {
      // 1. Extreme Spread Guard (Rollover/News Protection)
      const MAX_ALLOWED_SPREAD = 0.40; // $0.40 spread on Gold is extreme (normal is 0.08 - 0.15)
      if (liveSpread > MAX_ALLOWED_SPREAD) {
        logger.warn({ finalSignal, liveSpread, MAX_ALLOWED_SPREAD }, "[SpreadGuard] Suppressed due to extreme broker spread.");
        finalSignal = "HOLD";
        suppressionReason = `Extreme Spread detected (${liveSpread.toFixed(2)} pt). Waiting for liquidity to return.`;
      } else {
        // 2. For XAUUSD, an ATR on 5m below 0.60 generally means a flat, lifeless market.
        // We will suppress entries to avoid being chopped up by the spread.
        const minRequiredAtr = Math.max(0.40, liveSpread * 2.5);
        if (atr < minRequiredAtr) {
          logger.warn({ finalSignal, atr, liveSpread, minRequiredAtr }, "[VolatilityFilter] Suppressed due to low volatility vs high spread");
          finalSignal = "HOLD";
          suppressionReason = `Filtered by High Spread/Low Volatility (Spread: ${liveSpread.toFixed(2)})`;
        }
      }
    }

    // ── SL / TP: Structure-Based Dynamic Stops (ATR-backed, min 1.5:1 R:R) ──
    const { nearestSwingHigh, nearestSwingLow } = getNearestSwingLevels(candlesPrimary, 25);
    const minAtrPadding = atr * (signalType === "REVERSAL" ? 1.5 : 1.8);

    let slDist: number;
    const calcDir = finalSignal !== "HOLD" ? finalSignal : intendedSignal;

    if (calcDir === "LONG") {
      const anchorLow = (sweepRej.detected && sweepRej.rejectionType === "BULLISH" && sweepRej.sweptLevel)
        ? sweepRej.sweptLevel
        : nearestSwingLow;
      const structuralDist = anchorLow !== null
        ? (currentPrice - anchorLow) + (atr * 0.5)
        : minAtrPadding;
      slDist = Math.min(Math.max(structuralDist, minAtrPadding, 4.0), 12.0); // Tightened initial risk cap
    } else if (calcDir === "SHORT") {
      const anchorHigh = (sweepRej.detected && sweepRej.rejectionType === "BEARISH" && sweepRej.sweptLevel)
        ? sweepRej.sweptLevel
        : nearestSwingHigh;
      const structuralDist = anchorHigh !== null
        ? (anchorHigh - currentPrice) + (atr * 0.5)
        : minAtrPadding;
      slDist = Math.min(Math.max(structuralDist, minAtrPadding, 4.0), 12.0); // Tightened initial risk cap
    } else {
      slDist = Math.min(Math.max(minAtrPadding, 5.0), 15.0);
    }

    // Reward to Risk: 1.6:1 baseline, tightly restricted to 1.2:1 for counter-trend reversals, up to 2.5:1 when ADX > 25 indicates strong trend
    // Updated for $50-$100 day trading goal: minimum 1.5:1, baseline 2.0:1 R:R
    // Dynamically scaled RR for scalping (much tighter targets to ensure high win rate)
    const rrMultiplier = signalType === "REVERSAL" ? 1.5 : currentAdx > 25 ? 2.5 : 1.8;
    
    let tpDist = +(slDist * rrMultiplier).toFixed(2);
    
    // For RANGE trades, SL is placed tightly outside the box, and TP is placed near the opposite edge
    if (signalType === "RANGE") {
      slDist = Math.min(Math.max(atr * 1.5, 4.0), 10.0);
      const targetDist = calcDir === "LONG" 
        ? Math.max((rangeInfo.resistance - currentPrice) * 0.8, 5.0) 
        : Math.max((currentPrice - rangeInfo.support) * 0.8, 5.0);
      tpDist = +targetDist.toFixed(2);
    }

    const effectiveEntryPrice = calcDir === "LONG" ? +(currentPrice + liveSpread / 2).toFixed(2) : calcDir === "SHORT" ? +(currentPrice - liveSpread / 2).toFixed(2) : +currentPrice.toFixed(2);

    let stopLoss:   number;
    let takeProfit: number;

    if (calcDir === "LONG") {
      stopLoss   = +(effectiveEntryPrice - slDist).toFixed(2);
      takeProfit = +(effectiveEntryPrice + tpDist).toFixed(2);
    } else if (calcDir === "SHORT") {
      stopLoss   = +(effectiveEntryPrice + slDist).toFixed(2);
      takeProfit = +(effectiveEntryPrice - tpDist).toFixed(2);
    } else {
      stopLoss   = +(effectiveEntryPrice - slDist).toFixed(2);
      takeProfit = +(effectiveEntryPrice + tpDist).toFixed(2);
    }

    // ── Reason string ─────────────────────────────────────────────────────
    const sessionNote = `[${session.active}]`;
    let reason: string;

    if (finalSignal !== "HOLD" && direction !== "HOLD") {
      const parts: string[] = [];
      if      (emaScore >= 35) parts.push(`EMA9/21 ${freshCross ? "CROSSED" : "aligned"}`);
      else if (emaScore >= 20) parts.push(`EMA9 ${finalSignal === "LONG" ? ">" : "<"} EMA21`);
      if      (rsiScore >= 25) parts.push(`RSI ${rsi.toFixed(1)} optimal`);
      else if (rsiScore >= 12) parts.push(`RSI ${rsi.toFixed(1)}`);
      if      (macdScore >= 25) parts.push(`MACD ${finalSignal === "LONG" ? "bull" : "bear"} cross`);
      else if (macdScore >= 20) parts.push(`MACD ${finalSignal === "LONG" ? "bull" : "bear"}`);
      if (isTrueBreakout) parts.push("True Breakout Confirmed");
      if (isFalseBreakout) parts.push("False Breakout (Sweep) Confirmed");
      if (momentumScore >= 15) parts.push("5m confirms");
      if (fvgScore   > 0) parts.push("FVG entry zone");
      if (sweepScore > 0) parts.push("Liquidity swept");
      if (obScore    > 0) parts.push(`OB ×${dominant === "LONG" ? bullishOB?.strength : bearishOB?.strength}`);
      if (candlePattern)  parts.push(candlePattern);
      if (choch.detected && signalType === "REVERSAL") parts.push(`CHoCH @ ${choch.level}`);
      if (sweepRej.detected && sweepRej.rejectionType === (finalSignal === "LONG" ? "BULLISH" : "BEARISH") && signalType === "REVERSAL") parts.push(`Sweep reject @ ${sweepRej.sweptLevel}`);
      const typeTag = signalType === "REVERSAL" ? " ⟳REVERSAL" : "";
      const strPrefix = signalStrength ? `${signalStrength} ` : "";
      reason = `${strPrefix}${finalSignal}${typeTag} ${sessionNote} [conf:${confidence}% | SL:${slDist.toFixed(1)}pt TP:${tpDist.toFixed(1)}pt] — ${parts.join(" · ")}`;
    } else if (recentStops.inCircuitBreakerCooldown) {
      reason = `HOLD – Circuit Breaker (${recentStops.cooldownRemainingMinutes}m cooldown after ${recentStops.consecutiveLosses} consecutive losses) · Preserving capital during consolidation`;
    } else if (suppressionReason.length > 0) {
      const rangeText = (isMarketConsolidating && rangeInfo.isRanging) ? ` · Range ($${rangeInfo.support.toFixed(1)} – $${rangeInfo.resistance.toFixed(1)})` : "";
      reason = `HOLD – ${suppressionReason} ${sessionNote} · Best: ${dominant} ${Math.max(longNorm, shortNorm)}%${rangeText}`;
    } else if (direction !== "HOLD" && inSpikeCooldown) {
      reason = `HOLD – Spike cooldown (${spikeCooldownCandles} candle${spikeCooldownCandles !== 1 ? "s" : ""} remaining) · ${direction} ${Math.max(longNorm, shortNorm)}% queued after spike settles`;
    } else if (direction !== "HOLD" && inCooldown) {
      const mLeft = Math.ceil(cooldownRemaining / 60);
      reason = `HOLD – cooldown ${mLeft}m remaining · ${direction} signal (${Math.max(longNorm, shortNorm)}% conf) ready`;
    } else if (isMarketConsolidating && rangeInfo.isRanging && rangeInfo.position === "MID_CHOP_ZONE") {
      reason = `HOLD – Range consolidation ($${rangeInfo.support.toFixed(1)} – $${rangeInfo.resistance.toFixed(1)}) · Price in middle chop zone (waiting for boundary test)`;
    } else {
      const bestDir  = longNorm >= shortNorm ? "LONG" : "SHORT";
      const bestConf = Math.max(longNorm, shortNorm);
      const reqConf  = bestDir === "LONG" ? longMinConf : shortMinConf;
      const rangeText = (isMarketConsolidating && rangeInfo.isRanging) ? ` · Range ($${rangeInfo.support.toFixed(1)} – $${rangeInfo.resistance.toFixed(1)})` : "";
      reason = `HOLD – Waiting for confluence ${sessionNote} · Best: ${bestDir} ${bestConf}% (need ${reqConf}%)${rangeText}`;
    }

    // EXPERIMENT: INVERT SIGNALS (SCALPING)
    const EXPERIMENT_INVERT_SIGNALS = false;
    if (EXPERIMENT_INVERT_SIGNALS && finalSignal !== "HOLD") {
        finalSignal = finalSignal === "LONG" ? "SHORT" : "LONG";
        
        // Force tight SCALPING Stop Loss and Take Profit
        slDist = Math.max(1.5, Math.min(slDist * 0.5, 3.0)); // Extremely tight SL (1.5 to 3.0 points)
        tpDist = Math.max(2.5, Math.min(tpDist * 0.4, 6.0)); // Tight scalping TP (2.5 to 6.0 points)
        
        const newStopLoss = finalSignal === "LONG" ? currentPrice - slDist : currentPrice + slDist;
        const newTakeProfit = finalSignal === "LONG" ? currentPrice + tpDist : currentPrice - tpDist;
        
        stopLoss = +newStopLoss.toFixed(2);
        takeProfit = +newTakeProfit.toFixed(2);
        reason = "[INVERSE SCALP EXPERIMENT] " + reason.replace(/LONG/g, "LONG_TEMP").replace(/SHORT/g, "LONG").replace(/LONG_TEMP/g, "SHORT");
    }

    // (Commit logic moved to commitSignal, called by scheduler upon successful dispatch)

    const result: SignalResult = {
      signal:            finalSignal,
      confidence,
      entryPrice:        finalSignal === "LONG" ? +(currentPrice + liveSpread / 2).toFixed(2) : finalSignal === "SHORT" ? +(currentPrice - liveSpread / 2).toFixed(2) : +currentPrice.toFixed(2),
      stopLoss,
      takeProfit,
      trend:             overallTrend(trendPrimary, trendEntry),
      reason,
      timestamp:         new Date().toISOString(),
      tradeDuration:        EXPERIMENT_INVERT_SIGNALS ? "15-45 mins (Scalp)" : "2-8 hours",
      cooldownRemaining: finalSignal !== "HOLD" ? 0 : cooldownRemaining,
      smartMode,
      session,
      signalStrength,
            spikeCooldownCandles,
      spikeCooldownRemaining: Math.max(0, Math.ceil(((SPIKE_COOLDOWN_COUNT * 900000) - (Date.now() - spikeDetectedAt)) / 1000)),
      emaScore,
      rsiScore,
      macdScore,
      momentumScore,
      fvgScore,
      sweepScore,
      obScore,
      candleScore,
      candlePattern,
      signalType,
      patternDetected,
      patternStrength,
      contextValid,
      confluenceMet,
      confirmationStatus,
      indicators: {
        rsi:           +rsi.toFixed(2),
        ema9:          +ema9.toFixed(2),
        ema21:         +ema21.toFixed(2),
        macdLine:      +macdVal.toFixed(4),
        macdSignal:    +macdSig.toFixed(4),
        macdHistogram: +macdHist.toFixed(4),
        atr:           +atr.toFixed(2),
        trendPrimary,
        trendEntry,
        trend1h:       macro1hState,
      },
      circuitBreakerActive:            recentStops.inCircuitBreakerCooldown,
      circuitBreakerRemainingMinutes:  recentStops.cooldownRemainingMinutes,
      consecutiveLosses:               recentStops.consecutiveLosses,
    };

    cachedSignal = result;
    return result;

  } catch (err: any) {
    if (err.message && (err.message.includes('status code 503') || err.message.includes('MetaApi is not connected'))) {
      logger.warn(`[SignalEngine] MetaApi unavailable: ${err.message}. Signals paused.`);
    } else if (err.message && err.message.includes('Primary data source unavailable')) {
      logger.debug({ err: err.message }, "Scalp signal generation skipped (no primary data)");
    } else {
      logger.error({ err }, "Scalp signal generation failed");
    }

    const fallback: SignalResult = {
      signal:     "HOLD",
      confidence: 0,
      entryPrice: +currentPrice.toFixed(2),
      stopLoss:   +(currentPrice - 3).toFixed(2),
      takeProfit: +(currentPrice + 4.5).toFixed(2),
      trend:      "NEUTRAL",
      reason:     "HOLD – Signal generation failed; using safe defaults " + String(err.stack || err.message),
      timestamp:  new Date().toISOString(),
      tradeDuration:        "2-8 hours",
      cooldownRemaining,
      smartMode,
      session,
      signalStrength:    null,
      spikeCooldownCandles: 0,
      spikeCooldownRemaining: 0,
      emaScore:      0,
      rsiScore:      0,
      macdScore:     0,
      momentumScore: 0,
      fvgScore:      0,
      sweepScore:    0,
      obScore:       0,
      candleScore:        0,
      candlePattern:      null,
      signalType:         "TREND_FOLLOW" as const,
      patternDetected:    null,
      patternStrength:    0,
      contextValid:       false,
      confluenceMet:      false,
      confirmationStatus: null,
      indicators: {
        rsi: 50, ema9: currentPrice, ema21: currentPrice,
        macdLine: 0, macdSignal: 0, macdHistogram: 0, atr: 3,
        trendPrimary: "NEUTRAL", trendEntry: "NEUTRAL",
      },
      circuitBreakerActive: false,
      circuitBreakerRemainingMinutes: 0,
      consecutiveLosses: 0,
    };
    return fallback;
  }
}

// ── Restore cooldown from DB on server start ──────────────────────────────
// Prevents a server restart from resetting the 15-min inter-signal cooldown.
export async function initSignalCooldown(): Promise<void> {
  try {
    const last = await getLatestSignal();
    if (last) {
      lastSignalTime = last.createdAt.getTime();
      logger.info(
        { lastSignalAt: new Date(lastSignalTime).toISOString() },
        "Signal cooldown restored from DB",
      );
    }
  } catch (err: any) {
    logger.warn({ err }, "Failed to restore signal cooldown from DB — starting fresh");
  }
}

export function resetCooldownTimer() {
    lastSignalTime = Date.now();
    logger.info("Signal cooldown timer forcibly reset.");
}

export function commitSignal(signal: SignalResult) {
    if (signal.signal !== "HOLD") {
        lastSignalState = { signal: signal.signal, price: signal.entryPrice, timestamp: Date.now() };
        lastSignalTime = Date.now();
    }
}
