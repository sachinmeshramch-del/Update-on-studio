import type { OHLCCandle } from "./goldPrice.js";
import { detectSweepRejection, detectFVG, detectOrderBlocks, calcATR, calcEMA, calcRSI, calcADX } from "./technicalIndicators.js";

export interface IctSilverBulletSignalResult {
  signal: "LONG" | "SHORT";
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  trend: "BULLISH" | "BEARISH";
  reason: string;
  tradeDuration: string;
  signalType: "ICT_SILVER_BULLET";
  engine: "ICT_SILVER_BULLET";
  sweptLevel: number;
  rejectionType: "BULLISH" | "BEARISH";
  fvgLevel?: number;
  riskRewardRatio: number;
  timeWindowActive: boolean;
}

/**
 * Resamples 15m (or 5m) candles into 1H OHLC candles to guarantee multi-timeframe
 * macro trend alignment even when separate 1H historical candles are not passed.
 */
export function resampleTo1HCandles(candles: OHLCCandle[]): OHLCCandle[] {
  if (!candles || candles.length === 0) return [];
  const map1h = new Map<number, OHLCCandle>();
  for (const c of candles) {
    const tSec = typeof c.time === "number"
      ? (c.time > 1e12 ? Math.floor(c.time / 1000) : c.time)
      : Math.floor(new Date(c.time).getTime() / 1000);
    const hourBucket = Math.floor(tSec / 3600) * 3600;
    const existing = map1h.get(hourBucket);
    if (!existing) {
      map1h.set(hourBucket, {
        time: hourBucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 1,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume = (existing.volume || 0) + (c.volume || 0);
    }
  }
  return Array.from(map1h.values()).sort((a, b) => (a.time as number) - (b.time as number));
}

/**
 * Evaluates ICT Silver Bullet & Liquidity Sweep Strategy for Gold (XAUUSD)
 * Ultra-Low Drawdown Institutional Grade Engine:
 * 1. Strict Killzone Enforcement: London Open (08:00 - 09:15 UTC) & NY Silver Bullet Windows (12:00-12:20, 14:45-16:30 UTC).
 *    Hard-blocks all off-peak transition hours (07, 10, 11, 13, 17, 18 UTC) to eliminate chop traps.
 * 2. High-Impact Macro Economic Release Guard: Blocks entries during 12:20-12:45 UTC and 14:15-14:45 UTC to prevent catastrophic news slips.
 * 3. Guaranteed 1H Macro Trend Alignment: Synthesizes 1H structure to strictly forbid counter-trend longs during bear trends.
 * 4. ADX & RSI Momentum Guards: Eliminates trades with ADX < 20 or extreme momentum divergences.
 */
export function evaluateIctSilverBulletStrategy(
  currentPrice: number,
  spread: number,
  candles15m: OHLCCandle[],
  candles1h: OHLCCandle[],
  sessionInfo: { active: string; isAsian: boolean; isLondon: boolean; isNY: boolean; isOverlap: boolean }
): IctSilverBulletSignalResult | null {
  if (!candles15m || candles15m.length < 20) return null;

  // ── Step 1: Strict Prime Killzone Hour Check (UTC) ─────────────────────────
  const lastCandle = candles15m[candles15m.length - 1];
  const candleTime = typeof lastCandle.time === "number"
    ? new Date(lastCandle.time > 1e12 ? lastCandle.time : lastCandle.time * 1000)
    : new Date(lastCandle.time);
  const utcHour = candleTime.getUTCHours();
  const utcMinute = candleTime.getUTCMinutes();
  const timeInMinutes = utcHour * 60 + utcMinute;

  // 1. High-Impact Macro Economic Release Guard (US CPI, PPI, NFP, Retail Sales, Fed Rates):
  // 12:20 - 12:45 UTC (8:30 AM EST Major Release) & 14:15 - 14:45 UTC (10:00 AM EST Release / Open Whiplash)
  const isRedFolderNewsWindow = (timeInMinutes >= 12 * 60 + 20 && timeInMinutes <= 12 * 60 + 45) ||
                                (timeInMinutes >= 14 * 60 + 15 && timeInMinutes <= 14 * 60 + 45);
  if (isRedFolderNewsWindow) {
    return null;
  }

  // 2. Institutional Prime Killzones:
  // - London Open Prime Expansion: 08:00 - 09:15 UTC
  // - New York Institutional Expansion: 12:00 - 12:20 UTC & 14:45 - 16:30 UTC
  // (Excludes 07:00, 10:00, 11:00, 13:00 lunchtime lull, and 17:00-18:00 post-market close)
  const isLondonOpen = (utcHour === 8) || (utcHour === 9 && utcMinute <= 15);
  const isNyExpansion = (utcHour === 12 && utcMinute <= 20) || (utcHour === 14 && utcMinute >= 45) || (utcHour === 15) || (utcHour === 16 && utcMinute <= 30);
  const isHighEdgeKillzone = isLondonOpen || isNyExpansion;

  // Hard-block all off-killzone hours without exception
  if (!isHighEdgeKillzone) {
    return null;
  }

  const atrSeries = calcATR(candles15m, 14);
  const currentAtr = atrSeries.length > 0 ? atrSeries[atrSeries.length - 1] : 3.5;

  // ── Step 2: Detect Liquidity Sweep Rejection ───────────────────────────
  const sweep = detectSweepRejection(candles15m, currentAtr, 35);
  if (!sweep.detected || !sweep.rejectionType || !sweep.sweptLevel) {
    return null;
  }

  // ── Step 3: ADX Momentum & Guaranteed 1H Macro Trend Guard ─────────────
  const adxResult = calcADX(candles15m, 14);
  const currentAdx = adxResult.adx.length > 0 ? adxResult.adx[adxResult.adx.length - 1] : 25;
  
  // Suppress trades in low momentum consolidation (ADX < 20)
  if (currentAdx < 20) {
    return null;
  }

  // Ensure effective 1H candles exist by resampling from 15m if needed
  let effective1hCandles = candles1h;
  if (!effective1hCandles || effective1hCandles.length < 15) {
    effective1hCandles = resampleTo1HCandles(candles15m);
  }

  let macro1hTrend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (effective1hCandles && effective1hCandles.length >= 10) {
    const hCloses = effective1hCandles.map(c => c.close);
    const ema20 = calcEMA(hCloses, Math.min(20, hCloses.length - 1));
    const lastEma20 = ema20.length > 0 ? ema20[ema20.length - 1] : hCloses[hCloses.length - 1];
    const lastClose1h = hCloses[hCloses.length - 1];

    let ema50Val = lastEma20;
    if (effective1hCandles.length >= 30) {
      const ema50 = calcEMA(hCloses, Math.min(50, hCloses.length - 1));
      ema50Val = ema50[ema50.length - 1];
    }

    if (lastClose1h > lastEma20 + 0.20 || (lastEma20 > ema50Val && lastClose1h >= lastEma20)) {
      macro1hTrend = "BULLISH";
    } else if (lastClose1h < lastEma20 - 0.20 || (lastEma20 < ema50Val && lastClose1h <= lastEma20)) {
      macro1hTrend = "BEARISH";
    }
  }

  const closes15m = candles15m.map(c => c.close);
  const rsiSeries = calcRSI(closes15m, 14);
  const currentRsi = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : 50;

  const fvg = detectFVG(candles15m, 8);
  const ob = detectOrderBlocks(candles15m, currentAtr, 35);

  const roundedPrice = +currentPrice.toFixed(2);
  const spreadBuffer = Math.max(0.40, +(spread / 2).toFixed(2));

  // ── Step 4: Bullish Liquidity Sweep (SSL Swept Below -> LONG Reversal) ──
  if (sweep.rejectionType === "BULLISH") {
    // Hard Macro Trend Invalidation: Strictly forbid counter-trend longs during 1H bearish regimes
    if (macro1hTrend === "BEARISH") {
      return null;
    }
    // In neutral/sideways macro, demand strict FVG or strong sweep displacement
    if (macro1hTrend === "NEUTRAL" && !fvg && !sweep.isStrong) {
      return null;
    }
    // Prevent catching falling knives in severe oversold momentum
    if (currentRsi < 26) {
      return null;
    }

    const entryPrice = +(roundedPrice + spreadBuffer).toFixed(2);
    // Tighter structural stop loss to minimize MAE drawdown
    const rawSl = sweep.sweptLevel - Math.max(1.5, currentAtr * 0.45);
    const stopLoss = +rawSl.toFixed(2);
    const riskPts = +(entryPrice - stopLoss).toFixed(2);

    if (riskPts < 0.8 || riskPts > 9.5) return null;

    const targetMultiplier = sweep.isStrong ? 3.4 : 2.9;
    const takeProfit = +(entryPrice + riskPts * targetMultiplier).toFixed(2);
    const rr = +targetMultiplier.toFixed(1);

    const fvgText = fvg && fvg.type === "BULLISH" ? ` · FVG @ $${fvg.gapMid}` : "";
    const obText = ob.bullishOB ? ` · Demand OB @ $${ob.bullishOB.low}-$${ob.bullishOB.high}` : "";
    const killzoneText = isLondonOpen ? " [London Open Prime]" : " [NY Silver Bullet]";

    const confidence = sweep.isStrong ? 96 : 91;

    return {
      signal: "LONG",
      confidence,
      entryPrice,
      stopLoss,
      takeProfit,
      trend: "BULLISH",
      reason: `[ICT SILVER BULLET] Sell-Side Liquidity Swept @ $${sweep.sweptLevel.toFixed(2)}${fvgText}${obText}${killzoneText} · 1:${rr} R:R Target`,
      tradeDuration: "1h - 3h (Institutional Expansion)",
      signalType: "ICT_SILVER_BULLET",
      engine: "ICT_SILVER_BULLET",
      sweptLevel: sweep.sweptLevel,
      rejectionType: "BULLISH",
      fvgLevel: fvg?.gapMid,
      riskRewardRatio: rr,
      timeWindowActive: true,
    };
  }

  // ── Step 5: Bearish Liquidity Sweep (BSL Swept Above -> SHORT Reversal) ─
  if (sweep.rejectionType === "BEARISH") {
    // Hard Macro Trend Invalidation: Strictly forbid counter-trend shorts during 1H bullish regimes
    if (macro1hTrend === "BULLISH") {
      return null;
    }
    // In neutral/sideways macro, demand strict FVG or strong sweep displacement
    if (macro1hTrend === "NEUTRAL" && !fvg && !sweep.isStrong) {
      return null;
    }
    // Prevent shorting into extreme runaway buying momentum
    if (currentRsi > 74) {
      return null;
    }

    const entryPrice = +(roundedPrice - spreadBuffer).toFixed(2);
    // Tighter structural stop loss to minimize MAE drawdown
    const rawSl = sweep.sweptLevel + Math.max(1.5, currentAtr * 0.45);
    const stopLoss = +rawSl.toFixed(2);
    const riskPts = +(stopLoss - entryPrice).toFixed(2);

    if (riskPts < 0.8 || riskPts > 9.5) return null;

    const targetMultiplier = sweep.isStrong ? 3.4 : 2.9;
    const takeProfit = +(entryPrice - riskPts * targetMultiplier).toFixed(2);
    const rr = +targetMultiplier.toFixed(1);

    const fvgText = fvg && fvg.type === "BEARISH" ? ` · FVG @ $${fvg.gapMid}` : "";
    const obText = ob.bearishOB ? ` · Supply OB @ $${ob.bearishOB.low}-$${ob.bearishOB.high}` : "";
    const killzoneText = isLondonOpen ? " [London Open Prime]" : " [NY Silver Bullet]";

    const confidence = sweep.isStrong ? 96 : 91;

    return {
      signal: "SHORT",
      confidence,
      entryPrice,
      stopLoss,
      takeProfit,
      trend: "BEARISH",
      reason: `[ICT SILVER BULLET] Buy-Side Liquidity Swept @ $${sweep.sweptLevel.toFixed(2)}${fvgText}${obText}${killzoneText} · 1:${rr} R:R Target`,
      tradeDuration: "1h - 3h (Institutional Expansion)",
      signalType: "ICT_SILVER_BULLET",
      engine: "ICT_SILVER_BULLET",
      sweptLevel: sweep.sweptLevel,
      rejectionType: "BEARISH",
      fvgLevel: fvg?.gapMid,
      riskRewardRatio: rr,
      timeWindowActive: true,
    };
  }

  return null;
}
