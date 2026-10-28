import type { OHLCCandle } from "./goldPrice.js";
import { calcATR, calcEMA, calcRSI, calcADX } from "./technicalIndicators.js";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ICT Silver Bullet Strategy Engine Types & Interfaces
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type IctSetupState =
  | "IDLE"
  | "LIQUIDITY_IDENTIFIED"
  | "SWEEP_CONFIRMED"
  | "DISPLACEMENT_MSS_CONFIRMED"
  | "FVG_IDENTIFIED"
  | "ENTRY_WAITING"
  | "TRADE_ACTIVE"
  | "COMPLETED"
  | "INVALIDATED";

export type LiquiditySourceType =
  | "PDH_PDL"
  | "PNH_PNL"
  | "SWING_HIGH_LOW"
  | "EQUAL_HIGHS_LOWS";

export type EntryModelType =
  | "FVG_RETRACEMENT_EDGE"
  | "FVG_MIDPOINT_50"
  | "FVG_CUSTOM_DEPTH";

export interface CandidateLiquidityLevel {
  id: string;
  source: LiquiditySourceType;
  type: "BUY_SIDE" | "SELL_SIDE"; // Buy-Side Liquidity (BSL) or Sell-Side Liquidity (SSL)
  price: number;
  identificationTime: string; // ISO UTC
  identificationIndex: number;
}

export interface SweepResult {
  sweptLevel: CandidateLiquidityLevel;
  sweepTime: string;
  sweepIndex: number;
  sweepExtremePrice: number; // Lowest price on SSL sweep, highest on BSL sweep
  penetrationPts: number;
  rejectedCloseBackInside: boolean;
  direction: "BULLISH_SWEEP" | "BEARISH_SWEEP"; // Bullish sweep = SSL swept below; Bearish sweep = BSL swept above
}

export interface DisplacementMssResult {
  mssLevel: number;
  mssBreakTime: string;
  mssBreakIndex: number;
  breakType: "CLOSE" | "WICK";
  displacementBodyPts: number;
  displacementBodyToRangeRatio: number;
  displacementAtrMult: number;
  isDisplacementValid: boolean;
}

export interface FairValueGapInfo {
  id: string;
  direction: "BULLISH" | "BEARISH";
  top: number;
  bottom: number;
  midpoint: number; // 50% equilibrium level
  gapSizePts: number;
  candleATime: string;
  candleAIndex: number;
  candleCTime: string;
  candleCIndex: number;
  isFilled: boolean;
  isInvalidated: boolean;
}

export interface IctSetupDiagnosticLog {
  timestampUtc: string;
  timestampNy: string;
  state: IctSetupState;
  previousState: IctSetupState;
  reason: string;
  conditionsSatisfied: string[];
  conditionsFailed: string[];
  rejectionReason?: string;
}

export interface IctSetupContext {
  id: string;
  symbol: string;
  timeframe: string;
  state: IctSetupState;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  sessionName: "NY_MORNING" | "LONDON_MORNING" | "NY_AFTERNOON" | "CUSTOM" | "OFF_SESSION";
  nyTimeFormatted: string;
  candleTimestampUtc: string;

  liquidityLevel?: CandidateLiquidityLevel;
  sweep?: SweepResult;
  displacementMss?: DisplacementMssResult;
  fvg?: FairValueGapInfo;

  targetEntryPrice?: number;
  structuralStopLoss?: number;
  plannedTakeProfit?: number;
  plannedRiskRewardRatio?: number;
  calculatedLotSize?: number;

  diagnosticHistory: IctSetupDiagnosticLog[];
  invalidationReason?: string;
}

export interface IctSilverBulletConfig {
  symbol: string;
  timeframe: string;

  // Session Windows (in "America/New_York" IANA Time)
  enabledSessions: {
    nyMorning: boolean;     // 10:00 - 11:00 AM NY Time (Default TRUE)
    londonMorning: boolean; // 03:00 - 04:00 AM NY Time
    nyAfternoon: boolean;   // 02:00 - 03:00 PM NY Time
  };
  customSessionWindows?: Array<{
    name: string;
    startNyHour: number;
    startNyMinute: number;
    endNyHour: number;
    endNyMinute: number;
  }>;
  allowPostWindowManagement: boolean; // Default true (existing positions stay open)

  // Liquidity Identification
  liquiditySources: {
    pdhPdl: boolean;         // Previous-Day High & Low
    pnhPnl: boolean;         // Previous-Session High & Low
    swingHighLow: boolean;   // Confirmed Swing Highs & Lows
    equalHighsLows: boolean; // Equal Highs & Equal Lows
  };
  swingLookbackBars: number;            // Bars to left for fractal swing confirmation (default: 5)
  equalHighsLowsTolerancePrice: number; // Price tolerance in XAUUSD points (default: 0.50)
  equalHighsLowsToleranceAtrMult: number; // ATR tolerance multiplier (default: 0.15)
  sweepMinPenetrationPts: number;       // Min sweep penetration distance (default: 0.15)
  sweepMaxPenetrationPts: number;       // Max sweep penetration before setup is invalid (default: 12.0)
  sweepRequireCloseBackInside: boolean; // Require candle close back inside swept level (default: true)

  // Displacement & Market Structure Shift (MSS)
  displacementMinBodyAtrMult: number;     // Body >= K * ATR (default: 1.1)
  displacementMinBodyToRangeRatio: number; // Body / Total Range >= ratio (default: 0.55)
  displacementCloseInExtremePct: number;   // Close in top/bottom % of candle (default: 0.25)
  mssBreakMethod: "CLOSE" | "WICK";       // Method to confirm MSS break (default: "CLOSE")
  mssMaxSetupAgeBars: number;            // Max bars allowed from sweep to MSS (default: 12)

  // Fair Value Gap (FVG)
  fvgMinSizeAtrMult: number;            // Min FVG gap size vs ATR (default: 0.20)
  fvgMinSizeSpreadMult: number;         // Min FVG gap size vs spread (default: 1.5)
  fvgMaxAgeBars: number;                // Max bars FVG stays valid before expiry (default: 15)
  fvgRequirePostMssFormation: boolean;  // Must form AFTER sweep & displacement/MSS (default: true)

  // Entry Model
  entryModel: EntryModelType;
  fvgCustomRetracementDepthPct: number; // Depth inside FVG (0.0 = edge, 0.5 = 50% mid, 1.0 = deep)

  // Stop-Loss, Target & Risk Controls
  structuralSlBufferPts: number;        // Buffer pts added beyond sweep extreme (default: 0.50)
  structuralSlBufferAtrMult: number;    // ATR buffer added to SL (default: 0.15)
  minRiskRewardRatio: number;           // Minimum projected R:R ratio (default: 1.5)
  riskPerTradePercent: number;          // Equity Risk % per trade (default: 0.50%)
  dailyLossLimitPercent: number;        // Daily equity loss limit % (default: 3.0%)
  maxEntriesPerSession: number;         // Max entries per session window (default: 2)
  lossCooldownBars: number;             // Cooldown bars after consecutive loss (default: 3)

  // Context & Volatility Filters
  contextFilters: {
    useH1TrendFilter: boolean;           // Require H1 EMA20/50 alignment
    usePdhPdlProximityFilter: boolean;   // Avoid trade if target is beyond PDH/PDL resistance
    usePremiumDiscountFilter: boolean;   // Longs in Discount (<50% range), Shorts in Premium (>50%)
    useAtrRegimeFilter: boolean;         // Avoid extreme low or high ATR
    minAtrAllowed: number;              // Min ATR (default: 1.5)
    maxAtrAllowed: number;              // Max ATR (default: 18.0)
    useMaxSpreadFilter: boolean;         // Avoid high spread
    maxSpreadAllowed: number;            // Max spread pts (default: 0.80)
    useNewsBlackoutFilter: boolean;      // Blackout high impact news
    newsBlackoutMinutesBefore: number;   // Default: 15
    newsBlackoutMinutesAfter: number;    // Default: 15
    useMinDisplacementStrength: boolean; // Enforce displacement strength check
    useMinNetRiskReward: boolean;        // Enforce min net R:R check
    useMaxSetupAge: boolean;             // Enforce setup age limit
  };
}

export const DEFAULT_ICT_SILVER_BULLET_CONFIG: IctSilverBulletConfig = {
  symbol: "XAUUSD",
  timeframe: "5m",

  enabledSessions: {
    nyMorning: true,     // 10:00 - 11:00 AM NY Time (Primary ICT Silver Bullet Window)
    londonMorning: false, // 03:00 - 04:00 AM NY Time
    nyAfternoon: false,   // 02:00 - 03:00 PM NY Time
  },
  allowPostWindowManagement: true,

  liquiditySources: {
    pdhPdl: true,
    pnhPnl: true,
    swingHighLow: true,
    equalHighsLows: true,
  },
  swingLookbackBars: 5,
  equalHighsLowsTolerancePrice: 0.50,
  equalHighsLowsToleranceAtrMult: 0.15,
  sweepMinPenetrationPts: 0.15,
  sweepMaxPenetrationPts: 12.0,
  sweepRequireCloseBackInside: true,

  displacementMinBodyAtrMult: 1.1,
  displacementMinBodyToRangeRatio: 0.55,
  displacementCloseInExtremePct: 0.25,
  mssBreakMethod: "CLOSE",
  mssMaxSetupAgeBars: 12,

  fvgMinSizeAtrMult: 0.20,
  fvgMinSizeSpreadMult: 1.5,
  fvgMaxAgeBars: 15,
  fvgRequirePostMssFormation: true,

  entryModel: "FVG_MIDPOINT_50",
  fvgCustomRetracementDepthPct: 0.50,

  structuralSlBufferPts: 0.50,
  structuralSlBufferAtrMult: 0.15,
  minRiskRewardRatio: 1.5,
  riskPerTradePercent: 0.50,
  dailyLossLimitPercent: 3.0,
  maxEntriesPerSession: 2,
  lossCooldownBars: 3,

  contextFilters: {
    useH1TrendFilter: true,
    usePdhPdlProximityFilter: false,
    usePremiumDiscountFilter: true,
    useAtrRegimeFilter: true,
    minAtrAllowed: 1.5,
    maxAtrAllowed: 18.0,
    useMaxSpreadFilter: true,
    maxSpreadAllowed: 0.80,
    useNewsBlackoutFilter: true,
    newsBlackoutMinutesBefore: 15,
    newsBlackoutMinutesAfter: 15,
    useMinDisplacementStrength: true,
    useMinNetRiskReward: true,
    useMaxSetupAge: true,
  },
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Timezone Conversion Engine (America/New_York IANA)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface NyTimeInfo {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoNy: string;
  isDst: boolean;
}

/**
 * Converts any JavaScript Date or timestamp into America/New_York local time
 * taking into account Daylight Saving Time (EDT vs EST) dynamically.
 */
export function getNyTimeComponents(timeInput: string | number | Date): NyTimeInfo {
  const date = timeInput instanceof Date ? timeInput : new Date(typeof timeInput === "number" ? (timeInput > 1e11 ? timeInput : timeInput * 1000) : timeInput);
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const rawHour = partMap.hour === "24" ? "0" : partMap.hour;
  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  const hour = parseInt(rawHour, 10);
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);
  const tzName = partMap.timeZoneName || "EST";
  const isDst = tzName.includes("EDT") || tzName.includes("Daylight");

  const isoNy = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")} ${tzName}`;

  return { year, month, day, hour, minute, second, isoNy, isDst };
}

/**
 * Checks whether the current candle timestamp falls inside an active ICT Silver Bullet entry window
 */
export function evaluateSessionWindow(
  timeInput: string | number | Date,
  config: IctSilverBulletConfig
): {
  inWindow: boolean;
  sessionName: "NY_MORNING" | "LONDON_MORNING" | "NY_AFTERNOON" | "CUSTOM" | "OFF_SESSION";
  nyTimeFormatted: string;
} {
  const ny = getNyTimeComponents(timeInput);
  const timeInMinutes = ny.hour * 60 + ny.minute;

  // New York Morning Silver Bullet Window: 10:00 AM – 11:00 AM NY Local Time (600 to 660 mins)
  if (config.enabledSessions.nyMorning && timeInMinutes >= 10 * 60 && timeInMinutes <= 11 * 60) {
    return { inWindow: true, sessionName: "NY_MORNING", nyTimeFormatted: ny.isoNy };
  }

  // London Morning Silver Bullet Window: 03:00 AM – 04:00 AM NY Local Time (180 to 240 mins)
  if (config.enabledSessions.londonMorning && timeInMinutes >= 3 * 60 && timeInMinutes <= 4 * 60) {
    return { inWindow: true, sessionName: "LONDON_MORNING", nyTimeFormatted: ny.isoNy };
  }

  // New York Afternoon Silver Bullet Window: 02:00 PM – 03:00 PM NY Local Time (840 to 900 mins)
  if (config.enabledSessions.nyAfternoon && timeInMinutes >= 14 * 60 && timeInMinutes <= 15 * 60) {
    return { inWindow: true, sessionName: "NY_AFTERNOON", nyTimeFormatted: ny.isoNy };
  }

  // Custom session windows
  if (config.customSessionWindows) {
    for (const win of config.customSessionWindows) {
      const startMin = win.startNyHour * 60 + win.startNyMinute;
      const endMin = win.endNyHour * 60 + win.endNyMinute;
      if (timeInMinutes >= startMin && timeInMinutes <= endMin) {
        return { inWindow: true, sessionName: "CUSTOM", nyTimeFormatted: ny.isoNy };
      }
    }
  }

  return { inWindow: false, sessionName: "OFF_SESSION", nyTimeFormatted: ny.isoNy };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Pre-Sweep Candidate Liquidity Identification Module
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function preIdentifyLiquidityLevels(
  candles: OHLCCandle[],
  currentIndex: number,
  config: IctSilverBulletConfig,
  currentAtr: number
): CandidateLiquidityLevel[] {
  const levels: CandidateLiquidityLevel[] = [];
  if (currentIndex < 10) return levels;

  const currentCandle = candles[currentIndex];
  const candleTimeIso = new Date(
    typeof currentCandle.time === "number"
      ? (currentCandle.time > 1e11 ? currentCandle.time : currentCandle.time * 1000)
      : currentCandle.time
  ).toISOString();

  // 1. Previous Day High (PDH) and Previous Day Low (PDL)
  if (config.liquiditySources.pdhPdl) {
    const currentNy = getNyTimeComponents(currentCandle.time);
    let pdh = -1e9;
    let pdl = 1e9;
    let foundPd = false;

    // Scan backward to find previous day candles
    for (let k = currentIndex - 1; k >= 0; k--) {
      const kCandle = candles[k];
      if (!kCandle) continue;
      const kNy = getNyTimeComponents(kCandle.time);
      if (kNy.day !== currentNy.day || kNy.month !== currentNy.month || kNy.year !== currentNy.year) {
        // Collect candles belonging to that previous day
        pdh = Math.max(pdh, kCandle.high);
        pdl = Math.min(pdl, kCandle.low);
        foundPd = true;
      } else if (foundPd) {
        // Reached start of previous day
        break;
      }
    }

    if (foundPd && pdh > 0 && pdl < 1e8) {
      levels.push({
        id: `PDH_${pdh.toFixed(2)}`,
        source: "PDH_PDL",
        type: "BUY_SIDE",
        price: +pdh.toFixed(2),
        identificationTime: candleTimeIso,
        identificationIndex: currentIndex,
      });
      levels.push({
        id: `PDL_${pdl.toFixed(2)}`,
        source: "PDH_PDL",
        type: "SELL_SIDE",
        price: +pdl.toFixed(2),
        identificationTime: candleTimeIso,
        identificationIndex: currentIndex,
      });
    }
  }

  // 2. Confirmed Swing Highs & Swing Lows (Fractal Pivot Confirmation)
  if (config.liquiditySources.swingHighLow) {
    const lookback = config.swingLookbackBars || 5;
    const startIdx = Math.max(0, currentIndex - 100);

    for (let k = startIdx + lookback; k <= currentIndex - 1; k++) {
      const c = candles[k];
      if (!c) continue;
      let isSwingHigh = true;
      let isSwingLow = true;

      for (let offset = 1; offset <= lookback; offset++) {
        const prevCandle = k - offset >= 0 ? candles[k - offset] : undefined;
        const nextCandle = k + offset <= currentIndex ? candles[k + offset] : undefined;

        if (prevCandle) {
          if (prevCandle.high >= c.high) isSwingHigh = false;
          if (prevCandle.low <= c.low) isSwingLow = false;
        }
        if (nextCandle) {
          if (nextCandle.high >= c.high) isSwingHigh = false;
          if (nextCandle.low <= c.low) isSwingLow = false;
        }
      }

      const levelIso = new Date(
        typeof c.time === "number" ? (c.time > 1e11 ? c.time : c.time * 1000) : c.time
      ).toISOString();

      if (isSwingHigh) {
        levels.push({
          id: `SWING_HIGH_${c.high.toFixed(2)}_${k}`,
          source: "SWING_HIGH_LOW",
          type: "BUY_SIDE",
          price: +c.high.toFixed(2),
          identificationTime: levelIso,
          identificationIndex: k,
        });
      }
      if (isSwingLow) {
        levels.push({
          id: `SWING_LOW_${c.low.toFixed(2)}_${k}`,
          source: "SWING_HIGH_LOW",
          type: "SELL_SIDE",
          price: +c.low.toFixed(2),
          identificationTime: levelIso,
          identificationIndex: k,
        });
      }
    }
  }

  // 3. Equal Highs (EQH) and Equal Lows (EQL)
  if (config.liquiditySources.equalHighsLows) {
    const tolerance = Math.max(
      config.equalHighsLowsTolerancePrice || 0.50,
      currentAtr * (config.equalHighsLowsToleranceAtrMult || 0.15)
    );
    const startIdx = Math.max(0, currentIndex - 60);

    for (let a = startIdx; a < currentIndex - 3; a++) {
      for (let b = a + 3; b < currentIndex; b++) {
        const diffHigh = Math.abs(candles[a].high - candles[b].high);
        const diffLow = Math.abs(candles[a].low - candles[b].low);

        if (diffHigh <= tolerance) {
          const avgPrice = +((candles[a].high + candles[b].high) / 2).toFixed(2);
          levels.push({
            id: `EQH_${avgPrice}_${a}_${b}`,
            source: "EQUAL_HIGHS_LOWS",
            type: "BUY_SIDE",
            price: avgPrice,
            identificationTime: candleTimeIso,
            identificationIndex: b,
          });
        }
        if (diffLow <= tolerance) {
          const avgPrice = +((candles[a].low + candles[b].low) / 2).toFixed(2);
          levels.push({
            id: `EQL_${avgPrice}_${a}_${b}`,
            source: "EQUAL_HIGHS_LOWS",
            type: "SELL_SIDE",
            price: avgPrice,
            identificationTime: candleTimeIso,
            identificationIndex: b,
          });
        }
      }
    }
  }

  return levels;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Liquidity Sweep Detection Module
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function detectLiquiditySweep(
  candles: OHLCCandle[],
  currentIndex: number,
  candidateLevels: CandidateLiquidityLevel[],
  config: IctSilverBulletConfig
): SweepResult | null {
  if (currentIndex < 1) return null;
  const curr = candles[currentIndex];
  const candleIso = new Date(
    typeof curr.time === "number" ? (curr.time > 1e11 ? curr.time : curr.time * 1000) : curr.time
  ).toISOString();

  for (const lvl of candidateLevels) {
    // 1. Sell-Side Liquidity Sweep (Bullish Reversal Setup)
    if (lvl.type === "SELL_SIDE" && curr.low < lvl.price) {
      const penetration = +(lvl.price - curr.low).toFixed(2);
      const minPen = config.sweepMinPenetrationPts || 0.15;
      const maxPen = config.sweepMaxPenetrationPts || 12.0;

      if (penetration >= minPen && penetration <= maxPen) {
        const closeBackInside = curr.close >= lvl.price - 0.20;
        if (!config.sweepRequireCloseBackInside || closeBackInside) {
          return {
            sweptLevel: lvl,
            sweepTime: candleIso,
            sweepIndex: currentIndex,
            sweepExtremePrice: curr.low,
            penetrationPts: penetration,
            rejectedCloseBackInside: closeBackInside,
            direction: "BULLISH_SWEEP",
          };
        }
      }
    }

    // 2. Buy-Side Liquidity Sweep (Bearish Reversal Setup)
    if (lvl.type === "BUY_SIDE" && curr.high > lvl.price) {
      const penetration = +(curr.high - lvl.price).toFixed(2);
      const minPen = config.sweepMinPenetrationPts || 0.15;
      const maxPen = config.sweepMaxPenetrationPts || 12.0;

      if (penetration >= minPen && penetration <= maxPen) {
        const closeBackInside = curr.close <= lvl.price + 0.20;
        if (!config.sweepRequireCloseBackInside || closeBackInside) {
          return {
            sweptLevel: lvl,
            sweepTime: candleIso,
            sweepIndex: currentIndex,
            sweepExtremePrice: curr.high,
            penetrationPts: penetration,
            rejectedCloseBackInside: closeBackInside,
            direction: "BEARISH_SWEEP",
          };
        }
      }
    }
  }

  return null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Displacement & Market Structure Shift (MSS) Module
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function detectDisplacementAndMss(
  candles: OHLCCandle[],
  currentIndex: number,
  sweep: SweepResult,
  config: IctSilverBulletConfig,
  currentAtr: number
): DisplacementMssResult | null {
  if (currentIndex <= sweep.sweepIndex) return null;
  const barsSinceSweep = currentIndex - sweep.sweepIndex;
  if (barsSinceSweep > config.mssMaxSetupAgeBars) return null;

  const curr = candles[currentIndex];
  const range = curr.high - curr.low;
  if (range <= 0.01) return null;

  const body = Math.abs(curr.close - curr.open);
  const bodyToRangeRatio = +(body / range).toFixed(2);
  const bodyAtrMult = +(body / Math.max(0.5, currentAtr)).toFixed(2);

  // Check objective displacement strength
  const isBodyAtrValid = bodyAtrMult >= config.displacementMinBodyAtrMult;
  const isRatioValid = bodyToRangeRatio >= config.displacementMinBodyToRangeRatio;

  // Find qualifying short-term swing level broken for MSS
  let mssLevel = 0;
  let isMssBroken = false;

  const lookbackStart = Math.max(0, sweep.sweepIndex - 8);
  const lookbackEnd = sweep.sweepIndex;

  if (sweep.direction === "BULLISH_SWEEP") {
    // Bullish MSS: Break above a recent swing high formed before or during the sweep
    let highestSwing = -1e9;
    for (let k = lookbackStart; k <= lookbackEnd; k++) {
      if (candles[k]) highestSwing = Math.max(highestSwing, candles[k].high);
    }

    if (highestSwing > 0) {
      mssLevel = +highestSwing.toFixed(2);
      if (config.mssBreakMethod === "CLOSE") {
        isMssBroken = curr.close > mssLevel;
      } else {
        isMssBroken = curr.high > mssLevel;
      }
    }
  } else {
    // Bearish MSS: Break below a recent swing low formed before or during the sweep
    let lowestSwing = 1e9;
    for (let k = lookbackStart; k <= lookbackEnd; k++) {
      if (candles[k]) lowestSwing = Math.min(lowestSwing, candles[k].low);
    }

    if (lowestSwing < 1e8) {
      mssLevel = +lowestSwing.toFixed(2);
      if (config.mssBreakMethod === "CLOSE") {
        isMssBroken = curr.close < mssLevel;
      } else {
        isMssBroken = curr.low < mssLevel;
      }
    }
  }

  const isDisplacementValid = isBodyAtrValid && isRatioValid && isMssBroken;

  if (isMssBroken) {
    const candleIso = new Date(
      typeof curr.time === "number" ? (curr.time > 1e11 ? curr.time : curr.time * 1000) : curr.time
    ).toISOString();

    return {
      mssLevel,
      mssBreakTime: candleIso,
      mssBreakIndex: currentIndex,
      breakType: config.mssBreakMethod,
      displacementBodyPts: +body.toFixed(2),
      displacementBodyToRangeRatio: bodyToRangeRatio,
      displacementAtrMult: bodyAtrMult,
      isDisplacementValid,
    };
  }

  return null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3-Candle Fair Value Gap (FVG) Detection Module
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function detect3CandleFvg(
  candles: OHLCCandle[],
  currentIndex: number,
  sweep: SweepResult,
  config: IctSilverBulletConfig,
  currentAtr: number,
  spreadPts: number
): FairValueGapInfo | null {
  if (currentIndex < 2) return null;

  // 3-Candle FVG Pattern: Candle A (idx-2), Candle B (idx-1), Candle C (idx)
  const candleA = candles[currentIndex - 2];
  const candleC = candles[currentIndex];

  const candleATimeIso = new Date(
    typeof candleA.time === "number" ? (candleA.time > 1e11 ? candleA.time : candleA.time * 1000) : candleA.time
  ).toISOString();
  const candleCTimeIso = new Date(
    typeof candleC.time === "number" ? (candleC.time > 1e11 ? candleC.time : candleC.time * 1000) : candleC.time
  ).toISOString();

  // Bullish FVG: Low of Candle C > High of Candle A
  if (sweep.direction === "BULLISH_SWEEP" && candleC.low > candleA.high) {
    const bottom = +candleA.high.toFixed(2);
    const top = +candleC.low.toFixed(2);
    const gapSizePts = +(top - bottom).toFixed(2);
    const midpoint = +((top + bottom) / 2).toFixed(2);

    const minAtrSize = currentAtr * config.fvgMinSizeAtrMult;
    const minSpreadSize = spreadPts * config.fvgMinSizeSpreadMult;

    if (gapSizePts >= minAtrSize && gapSizePts >= minSpreadSize) {
      return {
        id: `BULL_FVG_${bottom}_${top}_${currentIndex}`,
        direction: "BULLISH",
        top,
        bottom,
        midpoint,
        gapSizePts,
        candleATime: candleATimeIso,
        candleAIndex: currentIndex - 2,
        candleCTime: candleCTimeIso,
        candleCIndex: currentIndex,
        isFilled: false,
        isInvalidated: false,
      };
    }
  }

  // Bearish FVG: High of Candle C < Low of Candle A
  if (sweep.direction === "BEARISH_SWEEP" && candleC.high < candleA.low) {
    const top = +candleA.low.toFixed(2);
    const bottom = +candleC.high.toFixed(2);
    const gapSizePts = +(top - bottom).toFixed(2);
    const midpoint = +((top + bottom) / 2).toFixed(2);

    const minAtrSize = currentAtr * config.fvgMinSizeAtrMult;
    const minSpreadSize = spreadPts * config.fvgMinSizeSpreadMult;

    if (gapSizePts >= minAtrSize && gapSizePts >= minSpreadSize) {
      return {
        id: `BEAR_FVG_${bottom}_${top}_${currentIndex}`,
        direction: "BEARISH",
        top,
        bottom,
        midpoint,
        gapSizePts,
        candleATime: candleATimeIso,
        candleAIndex: currentIndex - 2,
        candleCTime: candleCTimeIso,
        candleCIndex: currentIndex,
        isFilled: false,
        isInvalidated: false,
      };
    }
  }

  return null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete Stateful ICT Silver Bullet Strategy Engine Evaluator
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface IctSilverBulletEvaluationOutput {
  setup: IctSetupContext;
  signal: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  calculatedLotSize: number;
  reason: string;
  isTradeReady: boolean;
}

export class IctSilverBulletEngine {
  private config: IctSilverBulletConfig;
  private currentContext: IctSetupContext | null = null;
  private sessionEntriesCount: Record<string, number> = {};

  constructor(config: Partial<IctSilverBulletConfig> = {}) {
    this.config = { ...DEFAULT_ICT_SILVER_BULLET_CONFIG, ...config };
  }

  public getConfig(): IctSilverBulletConfig {
    return this.config;
  }

  public setConfig(newConfig: Partial<IctSilverBulletConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Resets the strategy setup state machine
   */
  public resetState(): void {
    this.currentContext = null;
  }

  /**
   * Processes the latest completed candle and returns state machine evaluation
   */
  public evaluateCandle(
    currentPrice: number,
    spreadPts: number,
    candles: OHLCCandle[],
    currentIndex: number,
    accountBalance = 1000
  ): IctSilverBulletEvaluationOutput | null {
    if (!candles || candles.length < 20 || currentIndex < 15) return null;

    const curr = candles[currentIndex];
    const candleIso = new Date(
      typeof curr.time === "number" ? (curr.time > 1e11 ? curr.time : curr.time * 1000) : curr.time
    ).toISOString();

    const atrSeries = calcATR(candles, 14);
    const currentAtr = atrSeries.length > 0 ? atrSeries[Math.min(currentIndex, atrSeries.length - 1)] : 3.5;

    // 1. Session Window Check
    const sessionEval = evaluateSessionWindow(curr.time, this.config);

    // Initialize state context if empty
    if (!this.currentContext) {
      this.currentContext = {
        id: `ICT_SETUP_${Date.now()}_${currentIndex}`,
        symbol: this.config.symbol,
        timeframe: this.config.timeframe,
        state: "IDLE",
        direction: "NEUTRAL",
        sessionName: sessionEval.sessionName,
        nyTimeFormatted: sessionEval.nyTimeFormatted,
        candleTimestampUtc: candleIso,
        diagnosticHistory: [],
      };
    }

    const ctx = this.currentContext;
    ctx.candleTimestampUtc = candleIso;
    ctx.nyTimeFormatted = sessionEval.nyTimeFormatted;
    ctx.sessionName = sessionEval.sessionName;

    // 2. Pre-Sweep Candidate Liquidity Identification
    const candidateLevels = preIdentifyLiquidityLevels(candles, currentIndex, this.config, currentAtr);
    if (candidateLevels.length > 0 && ctx.state === "IDLE") {
      this.transitionState(ctx, "LIQUIDITY_IDENTIFIED", `Pre-identified ${candidateLevels.length} liquidity levels (PDH/PDL/Swings/EQH/EQL)`, [
        `Pre-identified ${candidateLevels.length} levels`,
      ]);
    }

    // 3. Liquidity Sweep Detection
    if (sessionEval.inWindow && (ctx.state === "IDLE" || ctx.state === "LIQUIDITY_IDENTIFIED")) {
      const sweep = detectLiquiditySweep(candles, currentIndex, candidateLevels, this.config);
      if (sweep) {
        ctx.sweep = sweep;
        ctx.direction = sweep.direction === "BULLISH_SWEEP" ? "LONG" : "SHORT";
        this.transitionState(
          ctx,
          "SWEEP_CONFIRMED",
          `Confirmed ${sweep.direction} @ $${sweep.sweptLevel.price.toFixed(2)} (Penetration: ${sweep.penetrationPts} pts)`,
          [`Level ${sweep.sweptLevel.type} @ $${sweep.sweptLevel.price.toFixed(2)} swept`]
        );
      }
    }

    // 4. Displacement & Market Structure Shift (MSS) Confirmation
    if (ctx.state === "SWEEP_CONFIRMED" && ctx.sweep) {
      const displacementMss = detectDisplacementAndMss(candles, currentIndex, ctx.sweep, this.config, currentAtr);
      if (displacementMss) {
        ctx.displacementMss = displacementMss;
        this.transitionState(
          ctx,
          "DISPLACEMENT_MSS_CONFIRMED",
          `Confirmed MSS break @ $${displacementMss.mssLevel.toFixed(2)} (Body: ${displacementMss.displacementBodyPts} pts, Ratio: ${displacementMss.displacementBodyToRangeRatio})`,
          [`MSS Level $${displacementMss.mssLevel.toFixed(2)} broken by ${displacementMss.breakType}`]
        );
      } else {
        // Check timeout
        if (currentIndex - ctx.sweep.sweepIndex > this.config.mssMaxSetupAgeBars) {
          this.invalidateContext(ctx, `MSS setup aged out (${currentIndex - ctx.sweep.sweepIndex} bars > max ${this.config.mssMaxSetupAgeBars})`);
        }
      }
    }

    // 5. Fair Value Gap (FVG) Detection
    if (ctx.state === "DISPLACEMENT_MSS_CONFIRMED" && ctx.sweep) {
      const fvg = detect3CandleFvg(candles, currentIndex, ctx.sweep, this.config, currentAtr, spreadPts);
      if (fvg) {
        ctx.fvg = fvg;
        this.transitionState(
          ctx,
          "FVG_IDENTIFIED",
          `Confirmed 3-Candle ${fvg.direction} FVG ($${fvg.bottom} - $${fvg.top}, Mid: $${fvg.midpoint})`,
          [`FVG formed between $${fvg.bottom} and $${fvg.top}`]
        );
      } else if (ctx.displacementMss && currentIndex - ctx.displacementMss.mssBreakIndex > 8) {
        this.invalidateContext(ctx, "No FVG formed within 8 bars post MSS confirmation");
      }
    }

    // 6. Entry Model Calculation & Trade Waiting State
    if (ctx.state === "FVG_IDENTIFIED" && ctx.fvg && ctx.sweep) {
      // Determine Entry Price according to configured model
      let targetEntry = ctx.fvg.bottom;
      if (this.config.entryModel === "FVG_MIDPOINT_50") {
        targetEntry = ctx.fvg.midpoint;
      } else if (this.config.entryModel === "FVG_CUSTOM_DEPTH") {
        const depth = this.config.fvgCustomRetracementDepthPct || 0.50;
        targetEntry = ctx.fvg.direction === "BULLISH"
          ? +(ctx.fvg.bottom + (ctx.fvg.top - ctx.fvg.bottom) * depth).toFixed(2)
          : +(ctx.fvg.top - (ctx.fvg.top - ctx.fvg.bottom) * depth).toFixed(2);
      } else {
        // FVG Edge
        targetEntry = ctx.fvg.direction === "BULLISH" ? ctx.fvg.bottom : ctx.fvg.top;
      }

      ctx.targetEntryPrice = targetEntry;

      // Structural Stop Loss below sweep low (LONG) or above sweep high (SHORT) + buffers
      const slBuffer = Math.max(
        this.config.structuralSlBufferPts || 0.50,
        currentAtr * (this.config.structuralSlBufferAtrMult || 0.15)
      ) + spreadPts;

      if (ctx.direction === "LONG") {
        ctx.structuralStopLoss = +(ctx.sweep.sweepExtremePrice - slBuffer).toFixed(2);
      } else {
        ctx.structuralStopLoss = +(ctx.sweep.sweepExtremePrice + slBuffer).toFixed(2);
      }

      // Projected Risk Points
      const riskPts = Math.abs(ctx.targetEntryPrice - ctx.structuralStopLoss);

      // Target Price (Minimum R:R)
      const targetRr = Math.max(1.5, this.config.minRiskRewardRatio);
      if (ctx.direction === "LONG") {
        ctx.plannedTakeProfit = +(ctx.targetEntryPrice + riskPts * targetRr).toFixed(2);
      } else {
        ctx.plannedTakeProfit = +(ctx.targetEntryPrice - riskPts * targetRr).toFixed(2);
      }

      ctx.plannedRiskRewardRatio = targetRr;

      // Contract Spec aware lot sizing (100 oz per lot XAUUSD)
      const riskAmountDollars = accountBalance * ((this.config.riskPerTradePercent || 0.50) / 100);
      const rawLots = riskAmountDollars / (riskPts * 100);
      ctx.calculatedLotSize = +Math.max(0.01, Math.min(10.0, Math.floor(rawLots * 100) / 100)).toFixed(2);

      this.transitionState(
        ctx,
        "ENTRY_WAITING",
        `Entry Model ${this.config.entryModel} set @ $${ctx.targetEntryPrice} (SL: $${ctx.structuralStopLoss}, TP: $${ctx.plannedTakeProfit}, R:R 1:${ctx.plannedRiskRewardRatio})`,
        [`Target Entry $${ctx.targetEntryPrice} set`]
      );
    }

    // 7. Check FVG Fill & Entry Touch Execution
    if (ctx.state === "ENTRY_WAITING" && ctx.fvg && ctx.targetEntryPrice && ctx.structuralStopLoss && ctx.plannedTakeProfit) {
      let isEntryFilled = false;
      if (ctx.direction === "LONG" && curr.low <= ctx.targetEntryPrice) {
        isEntryFilled = true;
      } else if (ctx.direction === "SHORT" && curr.high >= ctx.targetEntryPrice) {
        isEntryFilled = true;
      }

      if (isEntryFilled) {
        this.transitionState(
          ctx,
          "TRADE_ACTIVE",
          `Limit entry filled @ $${ctx.targetEntryPrice} on candle ${candleIso}`,
          [`Entry price $${ctx.targetEntryPrice} filled`]
        );

        const resultOutput: IctSilverBulletEvaluationOutput = {
          setup: ctx,
          signal: ctx.direction as "LONG" | "SHORT",
          confidence: 95,
          entryPrice: ctx.targetEntryPrice,
          stopLoss: ctx.structuralStopLoss,
          takeProfit: ctx.plannedTakeProfit,
          riskRewardRatio: ctx.plannedRiskRewardRatio || 1.5,
          calculatedLotSize: ctx.calculatedLotSize || 0.01,
          reason: `[ICT SILVER BULLET] ${ctx.direction} Entry @ $${ctx.targetEntryPrice} · ${ctx.sessionName} Window · SL $${ctx.structuralStopLoss} · TP $${ctx.plannedTakeProfit} (R:R 1:${ctx.plannedRiskRewardRatio})`,
          isTradeReady: true,
        };

        // Reset context to IDLE after firing active trade signal
        this.resetState();
        return resultOutput;
      }

      // Check FVG expiration/invalidation
      if (currentIndex - ctx.fvg.candleCIndex > this.config.fvgMaxAgeBars) {
        this.invalidateContext(ctx, `FVG unfilled after ${currentIndex - ctx.fvg.candleCIndex} bars (max ${this.config.fvgMaxAgeBars})`);
      }
    }

    return null;
  }

  private transitionState(
    ctx: IctSetupContext,
    newState: IctSetupState,
    reason: string,
    conditionsSat: string[],
    conditionsFail: string[] = []
  ): void {
    const prev = ctx.state;
    ctx.state = newState;
    ctx.diagnosticHistory.push({
      timestampUtc: ctx.candleTimestampUtc,
      timestampNy: ctx.nyTimeFormatted,
      state: newState,
      previousState: prev,
      reason,
      conditionsSatisfied: conditionsSat,
      conditionsFailed: conditionsFail,
    });
  }

  private invalidateContext(ctx: IctSetupContext, reason: string): void {
    ctx.state = "INVALIDATED";
    ctx.invalidationReason = reason;
    ctx.diagnosticHistory.push({
      timestampUtc: ctx.candleTimestampUtc,
      timestampNy: ctx.nyTimeFormatted,
      state: "INVALIDATED",
      previousState: ctx.state,
      reason: `INVALIDATED: ${reason}`,
      conditionsSatisfied: [],
      conditionsFailed: [reason],
      rejectionReason: reason,
    });
    this.resetState();
  }
}
