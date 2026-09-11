import type { OHLCCandle } from "./goldPrice.js";

export function calcEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  if (closes.length === 0) return ema;
  ema[0] = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema[i] = closes[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

export function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(period).fill(50);
  if (closes.length < period + 1) return rsi;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses += Math.abs(delta);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const delta = closes[i] - closes[i - 1];
      const gain = delta > 0 ? delta : 0;
      const loss = delta < 0 ? Math.abs(delta) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return rsi;
}

export function calcMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ema12 = calcEMA(closes, fastPeriod);
  const ema26 = calcEMA(closes, slowPeriod);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine.slice(slowPeriod), signalPeriod);
  const padded = new Array(slowPeriod).fill(0).concat(signalLine);
  const histogram = macdLine.map((v, i) => v - (padded[i] ?? 0));
  return { macdLine, signalLine: padded, histogram };
}

export function calcATR(candles: OHLCCandle[], period = 14): number[] {
  if (candles.length < 2) return [0];
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }

  const atrs: number[] = [];
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  atrs.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    atrs.push(atr);
  }
  return atrs;
}

export function detectTrend(emaFast: number[], emaSlow: number[], minSpreadPercent = 0.00015): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (emaFast.length === 0 || emaSlow.length === 0) return "NEUTRAL";
  const lastFast = emaFast[emaFast.length - 1];
  const lastSlow = emaSlow[emaSlow.length - 1];
  const diff = lastFast - lastSlow;
  const threshold = Math.max(0.30, lastSlow * minSpreadPercent);
  if (diff > threshold) return "BULLISH";
  if (diff < -threshold) return "BEARISH";
  return "NEUTRAL";
}

export function findSupportResistance(candles: OHLCCandle[], lookback = 20): {
  support: number;
  resistance: number;
} {
  const recent = candles.slice(-lookback);
  const lows = recent.map(c => c.low);
  const highs = recent.map(c => c.high);
  return {
    support: Math.min(...lows),
    resistance: Math.max(...highs),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Money Concept (SMC) Detection
// ─────────────────────────────────────────────────────────────────────────────

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

export interface MarketStructureResult {
  structure: "UPTREND" | "DOWNTREND" | "RANGING";
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  lastHH: number | null;
  lastHL: number | null;
  lastLH: number | null;
  lastLL: number | null;
}

export interface LiquidityZone {
  price: number;
  type: "equal_high" | "equal_low";
  swept: boolean;
}

export interface OrderBlock {
  type: "bullish" | "bearish";
  high: number;
  low: number;
  index: number;
  mitigated: boolean;
  strength: number; // 1–3: confirming impulse candle count
  inZone:   boolean; // current price is within OB high/low
}

export interface BOSResult {
  bullishBOS: boolean;
  bearishBOS: boolean;
  bosLevel: number | null;
}

// Internal: find pivot swing highs and lows
function detectSwings(
  candles: OHLCCandle[],
  leftBars = 3,
  rightBars = 3
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const c = candles[i];

    const isSwingHigh =
      candles.slice(i - leftBars, i).every(l => l.high <= c.high) &&
      candles.slice(i + 1, i + rightBars + 1).every(r => r.high < c.high);

    const isSwingLow =
      candles.slice(i - leftBars, i).every(l => l.low >= c.low) &&
      candles.slice(i + 1, i + rightBars + 1).every(r => r.low > c.low);

    if (isSwingHigh) highs.push({ index: i, price: c.high, type: "high" });
    if (isSwingLow)  lows.push({ index: i, price: c.low,  type: "low" });
  }

  return { highs, lows };
}

// Classify market structure via HH/HL (uptrend) or LH/LL (downtrend)
export function detectMarketStructure(candles: OHLCCandle[]): MarketStructureResult {
  const { highs, lows } = detectSwings(candles, 3, 3);

  if (highs.length < 2 || lows.length < 2) {
    return {
      structure: "RANGING",
      swingHighs: highs,
      swingLows: lows,
      lastHH: null, lastHL: null,
      lastLH: null, lastLL: null,
    };
  }

  const lastHigh = highs[highs.length - 1].price;
  const prevHigh = highs[highs.length - 2].price;
  const lastLow  = lows[lows.length - 1].price;
  const prevLow  = lows[lows.length - 2].price;

  const isHH = lastHigh > prevHigh;
  const isHL = lastLow  > prevLow;
  const isLH = lastHigh < prevHigh;
  const isLL = lastLow  < prevLow;

  let structure: "UPTREND" | "DOWNTREND" | "RANGING" = "RANGING";
  if (isHH && isHL) structure = "UPTREND";
  else if (isLH && isLL) structure = "DOWNTREND";

  return {
    structure,
    swingHighs: highs,
    swingLows: lows,
    lastHH: isHH ? lastHigh : null,
    lastHL: isHL ? lastLow  : null,
    lastLH: isLH ? lastHigh : null,
    lastLL: isLL ? lastLow  : null,
  };
}

// Find equal highs/lows within tolerance and whether they've been swept (grabbed)
export function detectLiquidityZones(
  candles: OHLCCandle[],
  tolerance = 0.0012
): LiquidityZone[] {
  if (candles.length < 6) return [];

  const { highs, lows } = detectSwings(candles, 2, 2);
  const zones: LiquidityZone[] = [];

  const last = candles[candles.length - 1];
  const currentHigh  = last.high;
  const currentLow   = last.low;
  const currentClose = last.close;

  // Equal highs
  const seenHighZones = new Set<number>();
  for (let i = 0; i < highs.length - 1; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const diff = Math.abs(highs[i].price - highs[j].price) / highs[i].price;
      if (diff <= tolerance) {
        const zonePrice = (highs[i].price + highs[j].price) / 2;
        const key = Math.round(zonePrice * 100);
        if (!seenHighZones.has(key)) {
          seenHighZones.add(key);
          const swept = currentHigh > zonePrice && currentClose < zonePrice;
          zones.push({ price: +zonePrice.toFixed(2), type: "equal_high", swept });
        }
      }
    }
  }

  // Equal lows
  const seenLowZones = new Set<number>();
  for (let i = 0; i < lows.length - 1; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const diff = Math.abs(lows[i].price - lows[j].price) / lows[i].price;
      if (diff <= tolerance) {
        const zonePrice = (lows[i].price + lows[j].price) / 2;
        const key = Math.round(zonePrice * 100);
        if (!seenLowZones.has(key)) {
          seenLowZones.add(key);
          const swept = currentLow < zonePrice && currentClose > zonePrice;
          zones.push({ price: +zonePrice.toFixed(2), type: "equal_low", swept });
        }
      }
    }
  }

  return zones;
}

// Detect Break of Structure — current candle closes beyond a swing high/low
export function detectBOS(
  candles: OHLCCandle[],
  ms: MarketStructureResult
): BOSResult {
  if (candles.length < 4) {
    return { bullishBOS: false, bearishBOS: false, bosLevel: null };
  }

  const current = candles[candles.length - 1];
  const prev    = candles[candles.length - 2];

  const lastSwingHigh = ms.swingHighs.length > 0
    ? ms.swingHighs[ms.swingHighs.length - 1].price
    : null;
  const lastSwingLow = ms.swingLows.length > 0
    ? ms.swingLows[ms.swingLows.length - 1].price
    : null;

  // BOS confirmed when this candle closes beyond the swing level AND previous candle was also pushing
  const bullishBOS =
    lastSwingHigh !== null &&
    current.close > lastSwingHigh &&
    prev.close > (lastSwingHigh * 0.9995);   // prev was near or above

  const bearishBOS =
    lastSwingLow !== null &&
    current.close < lastSwingLow &&
    prev.close < (lastSwingLow * 1.0005);

  const bosLevel = bullishBOS ? lastSwingHigh
    : bearishBOS ? lastSwingLow
    : null;

  return { bullishBOS, bearishBOS, bosLevel };
}

// Find the most recent unmitigated Order Blocks.
//
// Rules (institutional-grade):
//   Bullish OB  = last BEARISH candle immediately before a strong bullish impulse
//   Bearish OB  = last BULLISH candle immediately before a strong bearish impulse
//
// Improvements over the naive version:
//   - Impulse strength validated against ATR (≥ ATR×1.5), not a flat % move
//   - Impulse measured over up to 4 candles (not just 2) — captures multi-bar moves
//   - `strength` (1–3): how many confirming candles drove the impulse
//   - `inZone`: current price is live inside the OB's high/low range
//   - Mitigation: price close through the opposite side of the OB invalidates it
export function detectOrderBlocks(
  candles: OHLCCandle[],
  atr = 3,
  lookback = 60,
): { bullishOB: OrderBlock | null; bearishOB: OrderBlock | null } {
  const n = candles.length;
  if (n < 6) return { bullishOB: null, bearishOB: null };

  const slice = candles.slice(Math.max(0, n - lookback));
  const len   = slice.length;

  // Impulse must move at least ATR × 1.5 to qualify as institutional
  const impulseThreshold = atr * 1.5;

  let bullishOB: OrderBlock | null = null;
  let bearishOB: OrderBlock | null = null;

  const currentPrice = slice[len - 1].close;

  // Scan most-recent first so we always find the freshest OB
  for (let i = len - 4; i >= 1; i--) {
    const c = slice[i]; // OB candidate candle

    // ── Bullish OB: bearish OB candle followed by bullish impulse ────────────
    if (!bullishOB && c.close < c.open) {
      let impulseBody    = 0;
      let confirmCount   = 0;
      for (let j = i + 1; j <= Math.min(i + 4, len - 1); j++) {
        const ic = slice[j]!;
        if (ic.close > ic.open) {
          impulseBody  += ic.close - ic.open;
          confirmCount++;
        }
      }

      if (impulseBody >= impulseThreshold && confirmCount >= 1) {
        const future    = slice.slice(i + 1);
        const mitigated = future.some(fc => fc.close < c.low); // price closed below OB low
        if (!mitigated) {
          const strength = confirmCount >= 3 ? 3 : confirmCount === 2 ? 2 : 1;
          const inZone   = currentPrice >= c.low && currentPrice <= c.high;
          bullishOB = {
            type: "bullish",
            high: +c.high.toFixed(2),
            low:  +c.low.toFixed(2),
            index: i,
            mitigated: false,
            strength,
            inZone,
          };
          if (inZone) break; // active OB — highest priority
        }
      }
    }

    // ── Bearish OB: bullish OB candle followed by bearish impulse ────────────
    if (!bearishOB && c.close > c.open) {
      let impulseBody    = 0;
      let confirmCount   = 0;
      for (let j = i + 1; j <= Math.min(i + 4, len - 1); j++) {
        const ic = slice[j]!;
        if (ic.close < ic.open) {
          impulseBody  += ic.open - ic.close;
          confirmCount++;
        }
      }

      if (impulseBody >= impulseThreshold && confirmCount >= 1) {
        const future    = slice.slice(i + 1);
        const mitigated = future.some(fc => fc.close > c.high); // price closed above OB high
        if (!mitigated) {
          const strength = confirmCount >= 3 ? 3 : confirmCount === 2 ? 2 : 1;
          const inZone   = currentPrice >= c.low && currentPrice <= c.high;
          bearishOB = {
            type: "bearish",
            high: +c.high.toFixed(2),
            low:  +c.low.toFixed(2),
            index: i,
            mitigated: false,
            strength,
            inZone,
          };
          if (inZone) break;
        }
      }
    }

    if (bullishOB && bearishOB) break;
  }

  return { bullishOB, bearishOB };
}

// Score current price position vs an Order Block (0, 10, 18, or 25 pts)
export function getOBScore(ob: OrderBlock | null): number {
  if (!ob || !ob.inZone) return 0;
  if (ob.strength >= 3) return 25;
  if (ob.strength === 2) return 18;
  return 10;
}

// ── Candlestick Pattern Detection ────────────────────────────────────────
//
// Detects 5 institutional-grade single- and two-candle reversal patterns.
// All wick/body thresholds are ATR-relative so they scale correctly with
// gold's price level and current volatility — no fixed-dollar or fixed-%
// cutoffs.
//
// Patterns & biases:
//   Hammer            → BULLISH  (long lower wick, small body near high)
//   Dragonfly Doji    → BULLISH  (open ≈ high ≈ close, long lower wick)
//   Shooting Star     → BEARISH  (long upper wick, small body near low)
//   Gravestone Doji   → BEARISH  (open ≈ low ≈ close, long upper wick)
//   Bullish Engulfing → BULLISH  (bullish body fully engulfs prior bearish body)
//   Bearish Engulfing → BEARISH  (bearish body fully engulfs prior bullish body)
//
// Each result now includes:
//   patternStrength — wick-to-body ratio score 0-100 (higher = more decisive)
//   contextValid    — trend context matches the pattern direction
//                     (bearish patterns require prior uptrend; bullish require downtrend)
//   confluenceMet   — strength ≥ 60 AND contextValid AND price near swing S/R level
export interface CandlePatternResult {
  pattern:         string | null;          // human-readable name, or null if none
  bias:            "BULLISH" | "BEARISH" | null;
  patternStrength: number;                 // 0-100 quality score
  contextValid:    boolean;               // prior trend matches reversal direction
  confluenceMet:   boolean;               // all three confluence gates passed
}

// Pattern strength score (0-100) based on wick-to-body ratios
function calcPatternStrength(
  patternName: string,
  curBody: number,
  prevBody: number,
  curUpper: number,
  curLower: number,
): number {
  const safeBody = Math.max(curBody, 0.01);
  const safePrev = Math.max(prevBody, 0.01);
  switch (patternName) {
    // Ratio: upperWick / body — capped at 5:1 → 100
    case "Shooting Star":
    case "Gravestone Doji":
      return Math.min(100, Math.round((curUpper / safeBody / 5) * 100));
    // Ratio: lowerWick / body — capped at 5:1 → 100
    case "Hammer":
    case "Dragonfly Doji":
      return Math.min(100, Math.round((curLower / safeBody / 5) * 100));
    // Ratio: currentBody / prevBody — capped at 3:1 → 100
    case "Bullish Engulfing":
    case "Bearish Engulfing":
      return Math.min(100, Math.round((curBody / safePrev / 3) * 100));
    default:
      return 50;
  }
}

// Trend-context gate: bearish patterns only valid in an uptrend, bullish in a downtrend.
// Uses a simple 3-candle slope (recent 3 closes vs prior 3 closes), ignoring the
// forming candle. Returns true when the pattern's countertrend setup is contextually sound.
function checkTrendContext(
  candles: OHLCCandle[],
  bias: "BULLISH" | "BEARISH",
): boolean {
  if (candles.length < 8) return false;
  // Exclude forming candle (index -1); compare averages of completed candles
  const recent = candles.slice(candles.length - 4, candles.length - 1); // last 3 closed
  const prior  = candles.slice(candles.length - 7, candles.length - 4); // 3 before those
  const recentAvg = recent.reduce((s, c) => s + c.close, 0) / recent.length;
  const priorAvg  = prior.reduce((s, c) => s + c.close, 0) / prior.length;
  // 0.03% threshold to avoid noise on flat markets
  const isUptrend   = recentAvg > priorAvg * 1.0003;
  const isDowntrend = recentAvg < priorAvg * 0.9997;
  // Bearish pattern should appear at the top of a move; bullish at the bottom
  return bias === "BEARISH" ? isUptrend : isDowntrend;
}

// S/R proximity gate: is current price within 1×ATR of a recent swing high or low?
// Patterns at structural levels are significantly more reliable.
function isNearSR(
  price: number,
  candles: OHLCCandle[],
  atr: number,
  lookback = 20,
): boolean {
  if (candles.length < 5 || atr <= 0) return false;
  const slice = candles.slice(Math.max(0, candles.length - 1 - lookback), candles.length - 1);
  let swingHigh: number | null = null;
  let swingLow:  number | null = null;
  for (let i = 1; i < slice.length - 1; i++) {
    const c = slice[i];
    const p = slice[i - 1];
    const n = slice[i + 1];
    if (swingHigh === null && c.high > p.high && c.high > n.high) swingHigh = c.high;
    if (swingLow  === null && c.low  < p.low  && c.low  < n.low)  swingLow  = c.low;
    if (swingHigh !== null && swingLow !== null) break;
  }
  if (swingHigh !== null && Math.abs(price - swingHigh) <= atr) return true;
  if (swingLow  !== null && Math.abs(price - swingLow)  <= atr) return true;
  return false;
}

export function detectCandlePattern(
  candles: OHLCCandle[],
  atr: number,
): CandlePatternResult {
  const none: CandlePatternResult = { pattern: null, bias: null, patternStrength: 0, contextValid: false, confluenceMet: false };
  if (candles.length < 2 || atr <= 0) return none;

  const cur  = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const curBody  = Math.abs(cur.close  - cur.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const curUpper = cur.high  - Math.max(cur.open,  cur.close);
  const curLower = Math.min(cur.open,  cur.close)  - cur.low;

  // ATR-scaled thresholds
  const minWick   = atr * 0.30;  // meaningful wick
  const smallBody = atr * 0.20;  // doji / pin bar body
  const medBody   = atr * 0.40;  // hammer / shooting star max body

  let detectedPattern: string | null = null;
  let detectedBias: "BULLISH" | "BEARISH" | null = null;

  // ── Engulfing patterns (two-candle, checked first — strongest signal) ──
  const curBull  = cur.close  > cur.open;
  const curBear  = cur.close  < cur.open;
  const prevBear = prev.close < prev.open;
  const prevBull = prev.close > prev.open;

  if (curBull && prevBear && prevBody > 0) {
    if (cur.close > prev.open && cur.open < prev.close) {
      detectedPattern = "Bullish Engulfing"; detectedBias = "BULLISH";
    }
  }
  if (detectedPattern === null && curBear && prevBull && prevBody > 0) {
    if (cur.close < prev.open && cur.open > prev.close) {
      detectedPattern = "Bearish Engulfing"; detectedBias = "BEARISH";
    }
  }

  // ── Single-candle patterns ────────────────────────────────────────────
  if (detectedPattern === null) {
    // Dragonfly Doji: body tiny, long lower wick, almost no upper wick
    if (curBody <= smallBody && curLower >= minWick && curUpper <= smallBody * 0.5) {
      detectedPattern = "Dragonfly Doji"; detectedBias = "BULLISH";
    // Gravestone Doji: body tiny, long upper wick, almost no lower wick
    } else if (curBody <= smallBody && curUpper >= minWick && curLower <= smallBody * 0.5) {
      detectedPattern = "Gravestone Doji"; detectedBias = "BEARISH";
    // Hammer: small-to-medium body near session high, long lower wick, tiny upper wick
    } else if (curBody <= medBody && curLower >= minWick && curLower >= curBody * 2 && curUpper <= curBody * 0.4) {
      detectedPattern = "Hammer"; detectedBias = "BULLISH";
    // Shooting Star: small-to-medium body near session low, long upper wick, tiny lower wick
    } else if (curBody <= medBody && curUpper >= minWick && curUpper >= curBody * 2 && curLower <= curBody * 0.4) {
      detectedPattern = "Shooting Star"; detectedBias = "BEARISH";
    }
  }

  if (detectedPattern === null || detectedBias === null) return none;

  // ── Enrichment: strength, context, confluence ─────────────────────────
  const patternStrength = calcPatternStrength(detectedPattern, curBody, prevBody, curUpper, curLower);
  const contextValid    = checkTrendContext(candles, detectedBias);
  const currentPrice    = cur.close;
  const nearSR          = isNearSR(currentPrice, candles, atr);
  // All three gates must pass for confluence
  const confluenceMet   = patternStrength >= 60 && contextValid && nearSR;

  return { pattern: detectedPattern, bias: detectedBias, patternStrength, contextValid, confluenceMet };
}

// ── Change of Character (CHoCH) ───────────────────────────────────────────
//
// CHoCH is the first structural break AGAINST the prevailing trend — the
// earliest reversal signal in Smart Money Concepts:
//   • In a BULLISH trend: current close breaks below the most recent swing low
//     → bearish CHoCH (signals possible SHORT reversal)
//   • In a BEARISH trend: current close breaks above the most recent swing high
//     → bullish CHoCH (signals possible LONG reversal)
export interface CHoCHResult {
  detected:  boolean;
  direction: "BULLISH" | "BEARISH" | null; // direction of the NEW move after the CHoCH
  level:     number | null;                 // the structural level that was broken
}

export function detectCHoCH(
  candles: OHLCCandle[],
  trend: "BULLISH" | "BEARISH" | "NEUTRAL",
  lookback = 25,
): CHoCHResult {
  const n = candles.length;
  if (n < 8 || trend === "NEUTRAL") return { detected: false, direction: null, level: null };

  const slice   = candles.slice(Math.max(0, n - lookback));
  const len     = slice.length;
  const current = slice[len - 1];

  if (trend === "BULLISH") {
    // Find the most recent confirmed swing low in the lookback (exclude last 2 candles)
    for (let i = len - 3; i >= 2; i--) {
      const c    = slice[i];
      const prev = slice[i - 1];
      const next = slice[i + 1];
      if (c.low < prev.low && c.low < next.low) {
        // CHoCH if price closes below this swing low
        if (current.close < c.low) {
          return { detected: true, direction: "BEARISH", level: +c.low.toFixed(2) };
        }
        break; // check only the most recent swing low
      }
    }
  } else {
    // BEARISH trend — find most recent swing high
    for (let i = len - 3; i >= 2; i--) {
      const c    = slice[i];
      const prev = slice[i - 1];
      const next = slice[i + 1];
      if (c.high > prev.high && c.high > next.high) {
        if (current.close > c.high) {
          return { detected: true, direction: "BULLISH", level: +c.high.toFixed(2) };
        }
        break;
      }
    }
  }

  return { detected: false, direction: null, level: null };
}

// ── Sweep Rejection ───────────────────────────────────────────────────────
//
// A sweep rejection is an institutional Smart Money Concepts (SMC) reversal:
//   1. Price wicks beyond a recent swing high, swing low, or support/resistance floor (the "sweep" or "stop hunt")
//   2. But closes firmly back inside the key boundary (the "rejection")
//   3. Or the immediately following candle prints an engulfing displacement back into the range.
//
// This traps breakout/stop orders and signals institutional reversal intent.
export interface SweepRejectionResult {
  detected:      boolean;
  rejectionType: "BEARISH" | "BULLISH" | null; // expected direction after rejection
  sweptLevel:    number | null;
  isStrong:      boolean;
}

export function detectSweepRejection(
  candles: OHLCCandle[],
  atr: number,
  lookback = 35,
): SweepRejectionResult {
  const n = candles.length;
  if (n < 6 || atr <= 0) return { detected: false, rejectionType: null, sweptLevel: null, isStrong: false };

  const slice  = candles.slice(Math.max(0, n - lookback));
  const len    = slice.length;
  if (len < 4) return { detected: false, rejectionType: null, sweptLevel: null, isStrong: false };

  const recent = slice[len - 1];
  const prev   = slice[len - 2];
  const prev2  = slice[len - 3];

  // Find all swing highs and lows from historical candles (excluding the last 2 evaluation bars)
  const historical = slice.slice(0, len - 2);
  const { highs, lows } = detectSwings(historical, 2, 2);
  
  const swingHighs: number[] = highs.map(h => h.price);
  const swingLows:  number[] = lows.map(l => l.price);

  // Also include the overall range support/resistance of the historical window
  const histLows = historical.map(c => c.low);
  const histHighs = historical.map(c => c.high);
  if (histLows.length > 0) {
    const minHistLow = Math.min(...histLows);
    if (!swingLows.includes(minHistLow)) swingLows.push(minHistLow);
  }
  if (histHighs.length > 0) {
    const maxHistHigh = Math.max(...histHighs);
    if (!swingHighs.includes(maxHistHigh)) swingHighs.push(maxHistHigh);
  }

  const wickThreshold = Math.max(0.1, atr * 0.15);

  // ── Bullish sweep rejection (Sell-Side Liquidity sweep below lows / support) ──
  for (const sLow of swingLows) {
    const candidates = [
      { candle: recent, isFollowThrough: false },
      { candle: prev,   isFollowThrough: false },
    ];

    for (const { candle: c } of candidates) {
      const swept    = c.low < (sLow - 0.05);
      const rejected = c.close > sLow;
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const body = Math.abs(c.close - c.open);
      const wickDom  = lowerWick >= (body * 0.35) || lowerWick >= (atr * 0.25);
      const prevCandle = c === recent ? prev : prev2;
      const isEngulfing = c.close > c.open && c.close > prevCandle.high && c.low < sLow;

      if (swept && rejected && (wickDom || isEngulfing)) {
        const isStrong = lowerWick >= (atr * 0.5) || isEngulfing || (c.close > c.open && body > atr * 0.5);
        return { detected: true, rejectionType: "BULLISH", sweptLevel: +sLow.toFixed(2), isStrong };
      }
    }

    // Two-bar sweep sequence: prev pierced below sLow, and recent closed strongly bullish back above sLow
    if (prev.low < sLow && recent.close > sLow && recent.close > recent.open && (recent.close > prev.high || recent.close > prev.open)) {
      return { detected: true, rejectionType: "BULLISH", sweptLevel: +sLow.toFixed(2), isStrong: true };
    }
  }

  // ── Bearish sweep rejection (Buy-Side Liquidity sweep above highs / resistance) ──
  for (const sHigh of swingHighs) {
    const candidates = [
      { candle: recent, isFollowThrough: false },
      { candle: prev,   isFollowThrough: false },
    ];

    for (const { candle: c } of candidates) {
      const swept    = c.high > (sHigh + 0.05);
      const rejected = c.close < sHigh;
      const upperWick = c.high - Math.max(c.open, c.close);
      const body = Math.abs(c.close - c.open);
      const wickDom  = upperWick >= (body * 0.35) || upperWick >= (atr * 0.25);
      const prevCandle = c === recent ? prev : prev2;
      const isEngulfing = c.close < c.open && c.close < prevCandle.low && c.high > sHigh;

      if (swept && rejected && (wickDom || isEngulfing)) {
        const isStrong = upperWick >= (atr * 0.5) || isEngulfing || (c.close < c.open && body > atr * 0.5);
        return { detected: true, rejectionType: "BEARISH", sweptLevel: +sHigh.toFixed(2), isStrong };
      }
    }

    // Two-bar sweep sequence: prev pierced above sHigh, and recent closed strongly bearish back below sHigh
    if (prev.high > sHigh && recent.close < sHigh && recent.close < recent.open && (recent.close < prev.low || recent.close < prev.open)) {
      return { detected: true, rejectionType: "BEARISH", sweptLevel: +sHigh.toFixed(2), isStrong: true };
    }
  }

  return { detected: false, rejectionType: null, sweptLevel: null, isStrong: false };
}

export function calcADX(candles: OHLCCandle[], period: number = 14): { adx: number[], plusDI: number[], minusDI: number[] } {
  if (candles.length <= period) {
    return { adx: [], plusDI: [], minusDI: [] };
  }
  
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i-1].high;
    const prevLow = candles[i-1].low;
    const prevClose = candles[i-1].close;
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
    minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
  }
  
  // RMA helper
  const calcRMA = (values: number[], per: number): number[] => {
    if (values.length < per) return [];
    const rma = new Array(values.length).fill(0);
    let sum = 0;
    for (let i = 0; i < per; i++) sum += values[i];
    rma[per - 1] = sum / per;
    for (let i = per; i < values.length; i++) {
      rma[i] = (rma[i - 1] * (per - 1) + values[i]) / per;
    }
    return rma;
  };
  
  const trRMA = calcRMA(tr, period);
  const plusDMRMA = calcRMA(plusDM, period);
  const minusDMRMA = calcRMA(minusDM, period);
  
  const plusDI = new Array(candles.length).fill(0);
  const minusDI = new Array(candles.length).fill(0);
  const dx = new Array(candles.length).fill(0);
  
  for (let i = period; i < candles.length; i++) {
    const trIndex = i - 1;
    if (trRMA[trIndex] > 0) {
      plusDI[i] = (plusDMRMA[trIndex] / trRMA[trIndex]) * 100;
      minusDI[i] = (minusDMRMA[trIndex] / trRMA[trIndex]) * 100;
      dx[i] = Math.abs(plusDI[i] - minusDI[i]) / (plusDI[i] + minusDI[i]) * 100;
    }
  }
  
  const adx = new Array(candles.length).fill(0);
  // dx is aligned with candles, but starts at index `period`
  const validDX = dx.slice(period);
  const adxRMA = calcRMA(validDX, period);
  
  for (let i = period * 2 - 1; i < candles.length; i++) {
    adx[i] = adxRMA[i - period];
  }
  
  return { adx, plusDI, minusDI };
}
export function calcVolumeSMA(candles: OHLCCandle[], period: number = 20): number[] {
  const sma = new Array(candles.length).fill(0);
  if (candles.length < period) return sma;
  
  let sum = 0;
  for (let i = 0; i < period; i++) sum += (candles[i].volume || 0);
  sma[period - 1] = sum / period;
  
  for (let i = period; i < candles.length; i++) {
    sum += (candles[i].volume || 0) - (candles[i - period].volume || 0);
    sma[i] = sum / period;
  }
  return sma;
}

export interface RangeAnalysis {
  isRanging: boolean;
  support: number;
  resistance: number;
  rangeSpan: number;
  rangeFloor: number;    // lower 30% boundary (Support Zone)
  rangeCeiling: number;  // upper 30% boundary (Resistance Zone)
  position: "SUPPORT_ZONE" | "RESISTANCE_ZONE" | "MID_CHOP_ZONE";
}

export function analyzeMarketRange(
  candles: OHLCCandle[],
  currentPrice: number,
  atr: number,
  lookback = 30
): RangeAnalysis {
  const sr = findSupportResistance(candles, lookback);
  const support = sr.support;
  const resistance = sr.resistance;
  const rangeSpan = Math.max(0.1, +(resistance - support).toFixed(2));
  
  const rangeFloor = +(support + rangeSpan * 0.30).toFixed(2);
  const rangeCeiling = +(resistance - rangeSpan * 0.30).toFixed(2);

  let position: RangeAnalysis["position"] = "MID_CHOP_ZONE";
  if (currentPrice <= rangeFloor) {
    position = "SUPPORT_ZONE";
  } else if (currentPrice >= rangeCeiling) {
    position = "RESISTANCE_ZONE";
  }

  // A genuine range requires:
  // 1. Minimum trading space (rangeSpan >= 1.0x ATR or at least 3.0 pts)
  // 2. Bounded span (not an outsized runaway trend expansion where rangeSpan > 4.5x ATR)
  // 3. Price oscillation rather than one-directional trend displacement across the lookback window
  const windowCandles = candles.slice(-lookback);
  let netDisplacement = 0;
  if (windowCandles.length >= 2) {
    const startPrice = windowCandles[0].open;
    const endPrice = windowCandles[windowCandles.length - 1].close;
    netDisplacement = Math.abs(endPrice - startPrice);
  }
  const isOneWayTrend = rangeSpan > 0 && (netDisplacement / rangeSpan) > 0.60;
  const isBounded = rangeSpan >= Math.max(atr * 1.0, 3.0) && rangeSpan <= Math.max(atr * 4.5, 25.0);
  const isRanging = isBounded && !isOneWayTrend;

  return {
    isRanging,
    support,
    resistance,
    rangeSpan,
    rangeFloor,
    rangeCeiling,
    position,
  };
}

export function getNearestSwingLevels(
  candles: OHLCCandle[],
  lookback = 25
): { nearestSwingHigh: number | null; nearestSwingLow: number | null } {
  const { highs, lows } = detectSwings(candles, 2, 2);
  const recentHighs = highs.filter(h => h.index >= candles.length - lookback);
  const recentLows = lows.filter(l => l.index >= candles.length - lookback);
  
  const nearestSwingHigh = recentHighs.length > 0 ? recentHighs[recentHighs.length - 1].price : null;
  const nearestSwingLow = recentLows.length > 0 ? recentLows[recentLows.length - 1].price : null;

  return { nearestSwingHigh, nearestSwingLow };
}

export interface FVG {
  type: "BULLISH" | "BEARISH";
  top: number;
  bottom: number;
  candleIndex: number;
}

export function detectFVG(candles: OHLCCandle[], lookback: number = 5): FVG | null {
  if (candles.length < 3) return null;
  // Look for FVG in the recent closed candles
  for (let i = candles.length - 1; i >= Math.max(2, candles.length - lookback); i--) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1]; // Displacement candle
    const c3 = candles[i];
    
    // Bearish FVG (Massive Drop)
    if (c1.low > c3.high) {
      return { type: "BEARISH", top: c1.low, bottom: c3.high, candleIndex: i - 1 };
    }
    // Bullish FVG (Massive Pump)
    if (c1.high < c3.low) {
      return { type: "BULLISH", top: c3.low, bottom: c1.high, candleIndex: i - 1 };
    }
  }
  return null;
}
