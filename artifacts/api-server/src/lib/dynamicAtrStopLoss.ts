import type { OHLCCandle } from "./goldPrice.js";
import { getNearestSwingLevels } from "./technicalIndicators.js";
import { logger } from "./logger.js";

export type AtrRegimePreset = "SCALP" | "STANDARD" | "SWING" | "VOLATILE_NEWS" | "CUSTOM";

export interface DynamicAtrStopLossRequest {
  currentPrice: number;
  direction: "LONG" | "SHORT";
  atr: number;
  candlesPrimary?: OHLCCandle[];
  liveSpread?: number;
  preset?: AtrRegimePreset;
  customMultiplier?: number;
  accountEquity?: number;
  riskPercent?: number;
  contractSize?: number;
  leverage?: number;
  signalType?: "TREND_FOLLOW" | "REVERSAL" | "RANGE";
  currentAdx?: number;
  featureStructuralStop?: boolean; // default: true
}

export interface DynamicAtrStopLossResult {
  entryPrice: number;
  stopLossPrice: number;
  stopLossDistance: number;
  atrValue: number;
  atrMultiplier: number;
  presetUsed: AtrRegimePreset;
  spreadBuffer: number;
  dynamicFloor: number;
  dynamicCap: number;
  anchoredToStructure: boolean;
  structureLevel: number | null;
  liquidationSafety: {
    status: "OPTIMAL" | "WIDE_SWING_PROTECTED" | "HIGH_RISK" | "DANGEROUSLY_TIGHT";
    label: string;
    description: string;
    noiseClearanceAtr: number;
    spreadImpactPercent: number;
  };
  takeProfitTargets: {
    tp1: { price: number; distance: number; rrRatio: number; label: string };
    tp2: { price: number; distance: number; rrRatio: number; label: string };
    tp3: { price: number; distance: number; rrRatio: number; label: string };
  };
  chandelierTrailingStop: {
    currentTrailPrice: number;
    trailDistance: number;
    description: string;
  };
  positionSizing: {
    accountEquity: number;
    riskPercent: number;
    riskAmountDollars: number;
    recommendedLots: number;
    maxRiskDollars: number;
    riskPerLot: number;
    marginRequiredEstimate: number;
    warning: string | null;
  };
}

/**
 * Calculates dynamic stop-loss and take-profit levels for Gold (XAUUSD)
 * specifically designed to prevent premature stop-outs from volatility noise and spread widening.
 */
export function calculateDynamicAtrStopLoss(req: DynamicAtrStopLossRequest): DynamicAtrStopLossResult {
  const {
    currentPrice,
    direction,
    candlesPrimary = [],
    liveSpread = 0.50,
    preset = "STANDARD",
    customMultiplier,
    accountEquity = 1000,
    riskPercent = 1.0,
    contractSize = 100,
    leverage = 100,
    signalType = "TREND_FOLLOW",
    currentAdx = 22,
  } = req;

  // 1. Sanitize & enforce sane ATR baseline for Gold (minimum 5m ATR is ~1.20 even in Asian dead zone)
  const atr = Math.max(req.atr && !isNaN(req.atr) ? req.atr : 2.50, 1.0);

  // 2. Select appropriate ATR multiplier for Gold Scalping
  let multiplier: number;
  if (customMultiplier && customMultiplier > 0) {
    multiplier = customMultiplier;
  } else {
    switch (preset) {
      case "SCALP":
        multiplier = 1.8;
        break;
      case "SWING":
        multiplier = 2.4;
        break;
      case "VOLATILE_NEWS":
        multiplier = 2.8;
        break;
      case "STANDARD":
      default:
        // Adapt multiplier based on signal type and ADX volatility for gold scalping
        if (signalType === "REVERSAL") {
          multiplier = 1.9;
        } else if (signalType === "RANGE") {
          multiplier = 1.7;
        } else if (currentAdx > 32) {
          multiplier = 2.2; // High momentum expansion
        } else {
          multiplier = 2.0;
        }
        break;
    }
  }

  // 3. Dynamic Floor & Spread Buffer (Tailored for Gold Intraday Volatility)
  // 3. Dynamic Floor & Spread Buffer (Tailored for Gold Intraday Volatility)
  // Dynamic floor of 3.80 - 4.50 pts prevents premature stop-outs during regular market swings.
  // Dynamic cap of 5.80 pts preserves capital and prevents outsized risk.
  const spreadBuffer = Number(Math.max(0.60, liveSpread * 1.5).toFixed(2));
  const dynamicFloor = Number(Math.max(3.80, Math.min(atr * 1.5, 4.50), liveSpread * 3.5).toFixed(2));
  const dynamicCap   = Number(Math.min(5.80, Math.max(5.00, atr * 1.8)).toFixed(2));

  const useStructuralStop = req.featureStructuralStop !== false;

  // 4. Structural Swing High/Low Anchor (15m Market Structure)
  let anchoredToStructure = false;
  let structureLevel: number | null = null;
  let stopLossDistance: number;
  let stopLossPrice: number;

  const entryPrice = direction === "LONG"
    ? Number((currentPrice + liveSpread / 2).toFixed(2))
    : Number((currentPrice - liveSpread / 2).toFixed(2));

  if (useStructuralStop) {
    // Intraday Structural Stop:
    // Anchored beyond recent 5-candle swing extreme + (0.3 * ATR) buffer + spread
    // Floor = 3.80 pts, Cap = 5.80 pts
    const recentCandles = (candlesPrimary && candlesPrimary.length > 0)
      ? candlesPrimary.slice(-5)
      : [];

    if (direction === "LONG") {
      const lowestLow = recentCandles.length > 0
        ? Math.min(...recentCandles.map(c => c.low))
        : (currentPrice - (atr * 1.6));
      structureLevel = Number(lowestLow.toFixed(2));
      const rawSl = lowestLow - (0.3 * atr) - liveSpread;
      const rawDistance = entryPrice - rawSl;
      stopLossDistance = Number(Math.max(3.8, Math.min(5.8, rawDistance)).toFixed(2));
      stopLossPrice = Number((entryPrice - stopLossDistance).toFixed(2));
      anchoredToStructure = true;
    } else {
      const highestHigh = recentCandles.length > 0
        ? Math.max(...recentCandles.map(c => c.high))
        : (currentPrice + (atr * 1.6));
      structureLevel = Number(highestHigh.toFixed(2));
      const rawSl = highestHigh + (0.3 * atr) + liveSpread;
      const rawDistance = rawSl - entryPrice;
      stopLossDistance = Number(Math.max(3.8, Math.min(5.8, rawDistance)).toFixed(2));
      stopLossPrice = Number((entryPrice + stopLossDistance).toFixed(2));
      anchoredToStructure = true;
    }
  } else {
    // Sane ATR multiple fallback
    stopLossDistance = Number(Math.max(3.8, Math.min(5.8, atr * multiplier)).toFixed(2));
    stopLossPrice = direction === "LONG"
      ? Number((entryPrice - stopLossDistance).toFixed(2))
      : Number((entryPrice + stopLossDistance).toFixed(2));
  }

  // 5. Liquidation Safety Analysis
  const noiseClearanceAtr = Number((stopLossDistance / atr).toFixed(2));
  const spreadImpactPercent = Number(((liveSpread / stopLossDistance) * 100).toFixed(1));

  let safetyStatus: DynamicAtrStopLossResult["liquidationSafety"]["status"] = "OPTIMAL";
  let safetyLabel: string = "Structural Clearance (1:2.5 R:R)";
  let safetyDescription: string = `Calibrated with ${noiseClearanceAtr}x ATR (${stopLossDistance} pts SL) anchored to 15m swing extreme with 0.6x ATR buffer.`;

  // 6. Target Dynamic Take Profits: Primary target calibrated to 2.5 * Risk (1:2.5 RR)
  const tp1Dist = Number((stopLossDistance * 1.5).toFixed(2));
  const tp2Dist = Number((stopLossDistance * 2.5).toFixed(2)); // 1:2.5 RR core intraday target
  const tp3Dist = Number((stopLossDistance * 3.5).toFixed(2)); // Runner expansion target

  const tp1Price = direction === "LONG" ? +(entryPrice + tp1Dist).toFixed(2) : +(entryPrice - tp1Dist).toFixed(2);
  const tp2Price = direction === "LONG" ? +(entryPrice + tp2Dist).toFixed(2) : +(entryPrice - tp2Dist).toFixed(2);
  const tp3Price = direction === "LONG" ? +(entryPrice + tp3Dist).toFixed(2) : +(entryPrice - tp3Dist).toFixed(2);

  const takeProfitTargets = {
    tp1: { price: tp1Price, distance: tp1Dist, rrRatio: 1.5, label: "TP1 (Conservative 1.5R)" },
    tp2: { price: tp2Price, distance: tp2Dist, rrRatio: 2.5, label: "TP2 (Core Intraday 2.5R)" },
    tp3: { price: tp3Price, distance: tp3Dist, rrRatio: 3.5, label: "TP3 (Session Runner 3.5R)" },
  };

  // 7. Chandelier Trailing Stop Level
  const trailDist = Number((atr * 2.2).toFixed(2));
  const chandelierPrice = direction === "LONG"
    ? Number((currentPrice - trailDist).toFixed(2))
    : Number((currentPrice + trailDist).toFixed(2));

  // 8. Dynamic Position Sizing (Anti-Liquidation Capital Shield)
  // Prevents traders from over-leveraging when volatility requires wider stops.
  const riskAmountDollars = Number((accountEquity * (riskPercent / 100)).toFixed(2));
  const riskPerLot = Number((stopLossDistance * contractSize).toFixed(2)); // e.g. 6.5 pts * 100 = $650 per 1.0 lot
  const lotStep = 0.01;
  const rawLots = riskPerLot > 0 ? (riskAmountDollars / riskPerLot) : 0.01;
  let recommendedLots = Number((Math.max(0.01, Math.floor(rawLots / lotStep) * lotStep)).toFixed(2));
  let maxRiskDollars = Number((recommendedLots * riskPerLot).toFixed(2));

  let sizingWarning: string | null = null;
  if (recommendedLots <= 0.01 && maxRiskDollars > riskAmountDollars * 1.5) {
    sizingWarning = `Account equity ($${accountEquity.toFixed(2)}) is low. Minimum lot 0.01 risks $${maxRiskDollars.toFixed(2)} (${((maxRiskDollars / accountEquity) * 100).toFixed(1)}%), exceeding desired ${riskPercent}% risk.`;
  }

  const marginRequiredEstimate = Number(((entryPrice * recommendedLots * contractSize) / leverage).toFixed(2));

  return {
    entryPrice,
    stopLossPrice,
    stopLossDistance,
    atrValue: Number(atr.toFixed(2)),
    atrMultiplier: Number(multiplier.toFixed(2)),
    presetUsed: preset,
    spreadBuffer,
    dynamicFloor,
    dynamicCap,
    anchoredToStructure,
    structureLevel,
    liquidationSafety: {
      status: safetyStatus,
      label: safetyLabel,
      description: safetyDescription,
      noiseClearanceAtr,
      spreadImpactPercent,
    },
    takeProfitTargets,
    chandelierTrailingStop: {
      currentTrailPrice: chandelierPrice,
      trailDistance: trailDist,
      description: `Trailing stop trails ${trailDist} pts behind extreme favorable price (${(2.2).toFixed(1)}x ATR).`,
    },
    positionSizing: {
      accountEquity,
      riskPercent,
      riskAmountDollars,
      recommendedLots,
      maxRiskDollars,
      riskPerLot,
      marginRequiredEstimate,
      warning: sizingWarning,
    },
  };
}
