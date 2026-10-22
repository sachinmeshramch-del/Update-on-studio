import type { OHLCCandle } from "./goldPrice.js";
import { logger } from "./logger.js";

export interface SupplyDemandZone {
  type: "SUPPLY" | "DEMAND";
  high: number;
  low: number;
  mid: number;
  originIndex: number;
  originTime: number;
  timeframe: "15m" | "1h";
  strength: number; // 1 to 3
  isMitigated: boolean;
  touches: number;
}

export interface AlphaTradesSignalResult {
  signal: "LONG" | "SHORT";
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  trend: "BULLISH" | "BEARISH";
  reason: string;
  tradeDuration: string;
  signalType: "ALPHA_TRADES_SD";
  engine: "ALPHA_TRADES_SD";
  zone: {
    type: "SUPPLY" | "DEMAND";
    high: number;
    low: number;
    timeframe: string;
  };
  trendlineBreak: boolean;
  rejectionWickConfirmed: boolean;
  riskRewardRatio: number;
}

/**
 * Detects institutional Supply and Demand zones on Gold candles
 * modeled after Alpha Trades (@alphatradesss) live trading methodology:
 * - Demand: Base candle followed by a massive bullish impulse candle creating an imbalance.
 * - Supply: Base candle followed by a massive bearish impulse candle creating an imbalance.
 * - Freshness: Only unmitigated or first-test zones are considered valid.
 */
export function detectSupplyDemandZones(
  candles: OHLCCandle[],
  timeframe: "15m" | "1h" = "15m",
  atr: number = 3.5,
  lookback: number = 60
): { supplyZones: SupplyDemandZone[]; demandZones: SupplyDemandZone[] } {
  const n = candles.length;
  if (n < 6) return { supplyZones: [], demandZones: [] };

  const slice = candles.slice(Math.max(0, n - lookback));
  const len = slice.length;
  const currentPrice = slice[len - 1].close;

  const impulseMin = atr * 1.6; // Institutional expansion threshold
  const supplyZones: SupplyDemandZone[] = [];
  const demandZones: SupplyDemandZone[] = [];

  for (let i = 1; i < len - 3; i++) {
    const c = slice[i];

    // ── Demand Zone Detection (Drop-Base-Rally or Rally-Base-Rally) ──
    // Bearish or neutral base candle followed by strong bullish expansion
    if (c.close <= c.open || (c.high - c.low) <= atr * 1.0) {
      let expansion = 0;
      let consecutiveBull = 0;
      for (let j = i + 1; j <= Math.min(i + 3, len - 1); j++) {
        const next = slice[j];
        if (next.close > next.open) {
          expansion += (next.close - next.open);
          consecutiveBull++;
        }
      }

      if (expansion >= impulseMin && consecutiveBull >= 1) {
        const future = slice.slice(i + 1);
        // Zone low is base low, zone high is max of base candle body/high
        const zoneLow = +c.low.toFixed(2);
        const zoneHigh = +Math.max(c.open, c.close).toFixed(2);
        
        // Mitigation check: did a subsequent candle close completely below the zone low?
        const isMitigated = future.some(fc => fc.close < zoneLow);
        if (!isMitigated && zoneHigh > zoneLow) {
          const touches = future.filter(fc => fc.low <= zoneHigh && fc.close >= zoneLow).length;
          // Alpha Trades prefers fresh zones or first/second touch
          if (touches <= 2) {
            demandZones.push({
              type: "DEMAND",
              high: zoneHigh,
              low: zoneLow,
              mid: +((zoneHigh + zoneLow) / 2).toFixed(2),
              originIndex: i,
              originTime: c.time,
              timeframe,
              strength: consecutiveBull >= 2 ? 3 : 2,
              isMitigated: false,
              touches,
            });
          }
        }
      }
    }

    // ── Supply Zone Detection (Rally-Base-Drop or Drop-Base-Drop) ──
    // Bullish or neutral base candle followed by strong bearish expansion
    if (c.close >= c.open || (c.high - c.low) <= atr * 1.0) {
      let expansion = 0;
      let consecutiveBear = 0;
      for (let j = i + 1; j <= Math.min(i + 3, len - 1); j++) {
        const next = slice[j];
        if (next.close < next.open) {
          expansion += (next.open - next.close);
          consecutiveBear++;
        }
      }

      if (expansion >= impulseMin && consecutiveBear >= 1) {
        const future = slice.slice(i + 1);
        const zoneHigh = +c.high.toFixed(2);
        const zoneLow = +Math.min(c.open, c.close).toFixed(2);

        // Mitigation check: did a subsequent candle close completely above the zone high?
        const isMitigated = future.some(fc => fc.close > zoneHigh);
        if (!isMitigated && zoneHigh > zoneLow) {
          const touches = future.filter(fc => fc.high >= zoneLow && fc.close <= zoneHigh).length;
          if (touches <= 2) {
            supplyZones.push({
              type: "SUPPLY",
              high: zoneHigh,
              low: zoneLow,
              mid: +((zoneHigh + zoneLow) / 2).toFixed(2),
              originIndex: i,
              originTime: c.time,
              timeframe,
              strength: consecutiveBear >= 2 ? 3 : 2,
              isMitigated: false,
              touches,
            });
          }
        }
      }
    }
  }

  // Sort by proximity to current price and recency
  demandZones.sort((a, b) => b.high - a.high); // Closest below current price first
  supplyZones.sort((a, b) => a.low - b.low);   // Closest above current price first

  return { supplyZones, demandZones };
}

/**
 * Detects Counter-Trendline Breaks into the Supply/Demand zone:
 * Alpha Trades draws diagonal trendlines on pullbacks.
 * For Demand Buys: A breakout above the descending pullback trendline.
 * For Supply Sells: A breakdown below the ascending pullback trendline.
 */
export function detectTrendlineBreakout(
  candles: OHLCCandle[],
  direction: "LONG" | "SHORT"
): { hasBreakout: boolean; description: string } {
  if (candles.length < 8) return { hasBreakout: false, description: "Insufficient candles" };
  const recent = candles.slice(-8);

  if (direction === "LONG") {
    // Check if previous 4 candles made lower highs and the latest candle broke above
    const h1 = recent[recent.length - 4].high;
    const h2 = recent[recent.length - 3].high;
    const h3 = recent[recent.length - 2].high;
    const currentClose = recent[recent.length - 1].close;

    const isDescending = h1 >= h2 && h2 >= h3;
    const brokeAbove = currentClose > h2;
    if (isDescending && brokeAbove) {
      return { hasBreakout: true, description: "Counter-trend descending trendline broken upward ✓" };
    }
    // Alternative: latest candle closed higher than prior 2 candle highs
    if (currentClose > Math.max(recent[recent.length - 2].high, recent[recent.length - 3].high)) {
      return { hasBreakout: true, description: "Local resistance pivot broken upward ✓" };
    }
  } else {
    // Check if previous 4 candles made higher lows and the latest candle broke below
    const l1 = recent[recent.length - 4].low;
    const l2 = recent[recent.length - 3].low;
    const l3 = recent[recent.length - 2].low;
    const currentClose = recent[recent.length - 1].close;

    const isAscending = l1 <= l2 && l2 <= l3;
    const brokeBelow = currentClose < l2;
    if (isAscending && brokeBelow) {
      return { hasBreakout: true, description: "Counter-trend ascending trendline broken downward ✓" };
    }
    if (currentClose < Math.min(recent[recent.length - 2].low, recent[recent.length - 3].low)) {
      return { hasBreakout: true, description: "Local support pivot broken downward ✓" };
    }
  }

  return { hasBreakout: false, description: "No clear trendline break yet" };
}

/**
 * Detects Rejection Pinbar Wick & Candle Close Confirmation:
 * Alpha Trades waits for a long wick into the zone showing institutional rejection.
 */
export function detectRejectionConfirmation(
  candles: OHLCCandle[],
  direction: "LONG" | "SHORT",
  zone: SupplyDemandZone
): { isConfirmed: boolean; description: string } {
  if (candles.length < 3) return { isConfirmed: false, description: "Insufficient candles" };

  const lastCandle = candles[candles.length - 2];   // Just closed candle
  const currentCandle = candles[candles.length - 1]; // Current candle

  const checkCandle = (c: OHLCCandle) => {
    const range = Math.max(0.2, c.high - c.low);
    if (direction === "LONG") {
      // Long lower wick into or near demand zone
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const wickRatio = lowerWick / range;
      const piercedZone = c.low <= zone.high && c.close >= zone.low;
      const isHammerOrBullClose = wickRatio >= 0.35 || c.close > c.open;
      return piercedZone && isHammerOrBullClose;
    } else {
      // Long upper wick into or near supply zone
      const upperWick = c.high - Math.max(c.open, c.close);
      const wickRatio = upperWick / range;
      const piercedZone = c.high >= zone.low && c.close <= zone.high;
      const isShootingStarOrBearClose = wickRatio >= 0.35 || c.close < c.open;
      return piercedZone && isShootingStarOrBearClose;
    }
  };

  if (checkCandle(lastCandle)) {
    return {
      isConfirmed: true,
      description: direction === "LONG"
        ? "Bullish wick rejection confirmed at Demand Zone ✓"
        : "Bearish wick rejection confirmed at Supply Zone ✓"
    };
  }

  if (checkCandle(currentCandle)) {
    return {
      isConfirmed: true,
      description: direction === "LONG"
        ? "Live candle showing strong buying response from Demand Zone ✓"
        : "Live candle showing strong selling defense at Supply Zone ✓"
    };
  }

  return { isConfirmed: false, description: "Waiting for clear rejection wick inside zone" };
}

/**
 * Master Evaluation Function for Alpha Trades Gold Strategy:
 * Evaluates current price against 15m & 1H Supply/Demand zones,
 * trendline breakouts, and rejection candlestick confirmations.
 */
export function evaluateAlphaTradesStrategy(
  currentPrice: number,
  liveSpread: number = 0.50,
  candles15m: OHLCCandle[],
  candles1h: OHLCCandle[] = [],
  session: { active?: string; london?: boolean; newYork?: boolean; asian?: boolean } = {}
): AlphaTradesSignalResult | null {
  if (!candles15m || candles15m.length < 20) return null;

  // 1. Session Filter: Alpha Trades focuses on high-volume US and London sessions
  const isHighVolumeSession = session.london || session.newYork;
  // If in dead Asian session, require higher confirmation
  const sessionBuffer = isHighVolumeSession ? 1.0 : 0.6;

  // Calculate 15m ATR
  const recent14 = candles15m.slice(-14);
  const atr = Math.max(
    recent14.reduce((sum, c) => sum + (c.high - c.low), 0) / 14,
    2.50
  );

  // 2. Detect 15m & 1H Zones
  const zones15m = detectSupplyDemandZones(candles15m, "15m", atr, 50);
  const zones1h = candles1h.length >= 15 ? detectSupplyDemandZones(candles1h, "1h", atr * 1.8, 40) : { supplyZones: [], demandZones: [] };

  const allDemand = [...zones1h.demandZones, ...zones15m.demandZones];
  const allSupply = [...zones1h.supplyZones, ...zones15m.supplyZones];

  // 3. Check for Demand Zone Interaction (LONG Setup)
  // Price has pulled back into or within 1.0 pt of a Demand Zone
  for (const demand of allDemand) {
    const isAtDemand = currentPrice >= (demand.low - liveSpread) && currentPrice <= (demand.high + 1.20);
    if (!isAtDemand) continue;

    const rejection = detectRejectionConfirmation(candles15m, "LONG", demand);
    const trendline = detectTrendlineBreakout(candles15m, "LONG");

    // Both rejection wick AND (trendline break OR high-volume session) needed
    if (rejection.isConfirmed && (trendline.hasBreakout || isHighVolumeSession)) {
      // Calculate Stop Loss: 2.0 to 3.0 pts beyond demand zone low
      const rawDistance = currentPrice - (demand.low - (0.5 * atr) - liveSpread);
      const stopLossDistance = Math.min(Math.max(rawDistance, 5.50), 9.50);
      const stopLoss = +(currentPrice - stopLossDistance).toFixed(2);

      // Calibrate 1:2.5 Risk-to-Reward Ratio
      const targetDistance = Number((stopLossDistance * 2.5).toFixed(2));
      const takeProfit = +(currentPrice + targetDistance).toFixed(2);

      const confidence = 88 + (demand.timeframe === "1h" ? 4 : 0) + (trendline.hasBreakout ? 2 : 0);

      logger.info(
        { demand, currentPrice, stopLoss, takeProfit, confidence },
        "🎯 [Alpha Trades Engine] Institutional DEMAND BUY Triggered!"
      );

      return {
        signal: "LONG",
        confidence: Math.min(confidence, 95),
        entryPrice: +(currentPrice + liveSpread / 2).toFixed(2),
        stopLoss,
        takeProfit,
        trend: "BULLISH",
        reason: `[ALPHA TRADES: ${demand.timeframe.toUpperCase()} DEMAND ZONE] Price tested institutional Demand ($${demand.low.toFixed(1)}–$${demand.high.toFixed(1)}) with ${rejection.description} · ${trendline.description} · 1:2.5 R:R`,
        tradeDuration: "1h - 4h (Intraday S&D)",
        signalType: "ALPHA_TRADES_SD",
        engine: "ALPHA_TRADES_SD",
        zone: {
          type: "DEMAND",
          high: demand.high,
          low: demand.low,
          timeframe: demand.timeframe,
        },
        trendlineBreak: trendline.hasBreakout,
        rejectionWickConfirmed: rejection.isConfirmed,
        riskRewardRatio: 2.5,
      };
    }
  }

  // 4. Check for Supply Zone Interaction (SHORT Setup)
  // Price has rallied into or within 1.0 pt of a Supply Zone
  for (const supply of allSupply) {
    const isAtSupply = currentPrice <= (supply.high + liveSpread) && currentPrice >= (supply.low - 1.20);
    if (!isAtSupply) continue;

    const rejection = detectRejectionConfirmation(candles15m, "SHORT", supply);
    const trendline = detectTrendlineBreakout(candles15m, "SHORT");

    if (rejection.isConfirmed && (trendline.hasBreakout || isHighVolumeSession)) {
      // Calculate Stop Loss: 2.0 to 3.0 pts beyond supply zone high
      const rawDistance = (supply.high + (0.5 * atr) + liveSpread) - currentPrice;
      const stopLossDistance = Math.min(Math.max(rawDistance, 5.50), 9.50);
      const stopLoss = +(currentPrice + stopLossDistance).toFixed(2);

      // Calibrate 1:2.5 Risk-to-Reward Ratio
      const targetDistance = Number((stopLossDistance * 2.5).toFixed(2));
      const takeProfit = +(currentPrice - targetDistance).toFixed(2);

      const confidence = 88 + (supply.timeframe === "1h" ? 4 : 0) + (trendline.hasBreakout ? 2 : 0);

      logger.info(
        { supply, currentPrice, stopLoss, takeProfit, confidence },
        "🎯 [Alpha Trades Engine] Institutional SUPPLY SELL Triggered!"
      );

      return {
        signal: "SHORT",
        confidence: Math.min(confidence, 95),
        entryPrice: +(currentPrice - liveSpread / 2).toFixed(2),
        stopLoss,
        takeProfit,
        trend: "BEARISH",
        reason: `[ALPHA TRADES: ${supply.timeframe.toUpperCase()} SUPPLY ZONE] Price tested institutional Supply ($${supply.low.toFixed(1)}–$${supply.high.toFixed(1)}) with ${rejection.description} · ${trendline.description} · 1:2.5 R:R`,
        tradeDuration: "1h - 4h (Intraday S&D)",
        signalType: "ALPHA_TRADES_SD",
        engine: "ALPHA_TRADES_SD",
        zone: {
          type: "SUPPLY",
          high: supply.high,
          low: supply.low,
          timeframe: supply.timeframe,
        },
        trendlineBreak: trendline.hasBreakout,
        rejectionWickConfirmed: rejection.isConfirmed,
        riskRewardRatio: 2.5,
      };
    }
  }

  return null;
}
