import {
  calcEMA,
  calcRSI,
  calcMACD,
  calcATR,
  calcADX,
  detectCandlePattern,
  detectOrderBlocks,
  analyzeMarketRange,
  isNearSR,
} from "./technicalIndicators.js";
import {
  calculateEntryExecution,
  calculateExitExecution,
  calculateMoneyPnL,
  resolveIntrabarCollision,
  DEFAULT_COST_SETTINGS,
  DEFAULT_GOLD_SPEC,
  type ExecutionCostSettings,
  type BrokerSymbolSpec,
} from "./executionCostModel.js";
import { queryAsOHLCCandles, saveBacktestRun } from "./historicalDataManager.js";
import { logger } from "./logger.js";
import type { OHLCCandle } from "./goldPrice.js";

export type TrailingStopVariant =
  | "NO_TRAILING"
  | "FIXED_DISTANCE"
  | "ATR_BASED"
  | "BREAKEVEN_THEN_TRAILING"
  | "PROFIT_TRIGGERED"
  | "EXISTING_ASYMMETRIC";

export interface AdvancedBacktestParams {
  symbol?: string; // e.g. "GOLD" or "XAUUSD"
  timeframe?: string; // "1m" | "5m" | "15m"
  startTime?: number; // unix ms
  endTime?: number; // unix ms
  initialBalance?: number; // default $10,000
  riskPercent?: number; // default 1.0%
  fixedVolume?: number; // optional fixed lot size override (e.g. 0.01)
  trailingVariant?: TrailingStopVariant;
  // Trailing configuration
  fixedTrailingDistance?: number; // e.g. 5.0 points
  atrTrailingMultiplier?: number; // e.g. 2.0x ATR
  breakevenTriggerPoints?: number; // e.g. 3.0 points in favor before locking BE
  profitTriggerPoints?: number; // e.g. 6.0 points before trailing activates
  // Dataset Split
  trainSplitPct?: number; // e.g. 60%
  valSplitPct?: number; // e.g. 20%
  testSplitPct?: number; // e.g. 20%
  // Execution Costs
  costs?: Partial<ExecutionCostSettings>;
  // Strategy Feature Flags
  featureStructuralStop?: boolean;
  featureEntryConfirmation?: boolean;
  featureContextPatternFilter?: boolean;
  featureSpreadGuard?: boolean;
  featureSessionFilter?: boolean;
  tpRatio?: number;
}

export interface BacktestTradeRecord {
  id: string;
  splitPhase: "TRAIN" | "VALIDATION" | "TEST";
  signalTime: string;
  entryTime: string;
  exitTime: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnlPoints: number;
  netProfitDollars: number;
  commissionDollars: number;
  slippagePoints: number;
  outcome: "WIN" | "LOSS";
  rOutcome: number;
  maePoints: number;
  mfePoints: number;
  durationMinutes: number;
  pattern: string;
  session: "London" | "New York" | "Asian" | "London/NY Overlap" | "Off-hours";
  regime: "TRENDING" | "RANGING";
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "TRAILING_STOP" | "BREAK_EVEN" | "END_OF_DATA";
  isAmbiguousIntrabar: boolean;
  balanceAfter: number;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  initialBalance: number;
  finalBalance: number;
  netProfitDollars: number;
  netProfitPercent: number;
  netProfitPoints: number;
  grossProfitDollars: number;
  grossLossDollars: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownDollars: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  averageWinDollars: number;
  averageLossDollars: number;
  averageR: number;
  averageDurationMinutes: number;
  exitCounts: {
    takeProfit: number;
    stopLoss: number;
    trailingStop: number;
    breakEven: number;
    endOfData: number;
    ambiguousIntrabar: number;
  };
  overfittingFlags: string[];
}

export interface SplitPhaseReport {
  phase: "TRAIN" | "VALIDATION" | "TEST";
  candleCount: number;
  startDate: string;
  endDate: string;
  metrics: PerformanceMetrics;
}

export interface AdvancedBacktestResult {
  runId: string;
  strategyName: string;
  strategyVersion: string;
  symbol: string;
  timeframe: string;
  evaluatedCandles: number;
  overallMetrics: PerformanceMetrics;
  splits: SplitPhaseReport[];
  monthlyBreakdown: {
    month: string;
    trades: number;
    winRate: number;
    netProfitDollars: number;
    profitFactor: number;
  }[];
  sessionBreakdown: {
    session: string;
    trades: number;
    winRate: number;
    netProfitDollars: number;
    profitFactor: number;
  }[];
  equityCurve: {
    time: string;
    tradeIndex: number;
    balance: number;
    drawdownPercent: number;
  }[];
  trades: BacktestTradeRecord[];
  trailingVariantUsed: TrailingStopVariant;
}

function getSessionName(utcHour: number): "London" | "New York" | "Asian" | "London/NY Overlap" | "Off-hours" {
  const isLondon = utcHour >= 7 && utcHour < 17;
  const isNY = utcHour >= 12 && utcHour < 21;
  const isAsian = utcHour >= 22 || utcHour < 7;

  if (isLondon && isNY) return "London/NY Overlap";
  if (isLondon) return "London";
  if (isNY) return "New York";
  if (isAsian) return "Asian";
  return "Off-hours";
}

/**
 * Calculate comprehensive quantitative performance metrics from a list of simulated trades
 */
export function calculatePerformanceMetrics(
  trades: BacktestTradeRecord[],
  initialBalance: number
): PerformanceMetrics {
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      initialBalance,
      finalBalance: initialBalance,
      netProfitDollars: 0,
      netProfitPercent: 0,
      netProfitPoints: 0,
      grossProfitDollars: 0,
      grossLossDollars: 0,
      profitFactor: 0,
      expectancyR: 0,
      maxDrawdownDollars: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      averageWinDollars: 0,
      averageLossDollars: 0,
      averageR: 0,
      averageDurationMinutes: 0,
      exitCounts: {
        takeProfit: 0,
        stopLoss: 0,
        trailingStop: 0,
        breakEven: 0,
        endOfData: 0,
        ambiguousIntrabar: 0,
      },
      overfittingFlags: ["No trades executed in dataset."],
    };
  }

  const wins = trades.filter((t) => t.outcome === "WIN");
  const losses = trades.filter((t) => t.outcome === "LOSS");
  const winningTrades = wins.length;
  const losingTrades = losses.length;
  const winRate = Number(((winningTrades / totalTrades) * 100).toFixed(1));

  let grossProfitDollars = 0;
  let grossLossDollars = 0;
  let netProfitPoints = 0;
  let totalR = 0;
  let totalDuration = 0;

  for (const t of trades) {
    netProfitPoints += t.pnlPoints;
    totalR += t.rOutcome;
    totalDuration += t.durationMinutes;
    if (t.netProfitDollars > 0) {
      grossProfitDollars += t.netProfitDollars;
    } else {
      grossLossDollars += Math.abs(t.netProfitDollars);
    }
  }

  const netProfitDollars = Number((grossProfitDollars - grossLossDollars).toFixed(2));
  const finalBalance = Number((initialBalance + netProfitDollars).toFixed(2));
  const netProfitPercent = Number(((netProfitDollars / initialBalance) * 100).toFixed(2));
  const profitFactor = grossLossDollars > 0 ? Number((grossProfitDollars / grossLossDollars).toFixed(2)) : grossProfitDollars > 0 ? 99.0 : 0;
  const expectancyR = Number((totalR / totalTrades).toFixed(2));
  const averageWinDollars = winningTrades > 0 ? Number((grossProfitDollars / winningTrades).toFixed(2)) : 0;
  const averageLossDollars = losingTrades > 0 ? Number((grossLossDollars / losingTrades).toFixed(2)) : 0;
  const averageR = expectancyR;
  const averageDurationMinutes = Number((totalDuration / totalTrades).toFixed(1));

  // Calculate Drawdown Curve
  let peakBalance = initialBalance;
  let runningBalance = initialBalance;
  let maxDrawdownDollars = 0;
  let maxDrawdownPercent = 0;
  const returns: number[] = [];

  for (const t of trades) {
    runningBalance += t.netProfitDollars;
    returns.push(t.netProfitDollars / initialBalance);
    if (runningBalance > peakBalance) {
      peakBalance = runningBalance;
    }
    const ddDollars = peakBalance - runningBalance;
    const ddPct = peakBalance > 0 ? (ddDollars / peakBalance) * 100 : 0;
    if (ddDollars > maxDrawdownDollars) maxDrawdownDollars = ddDollars;
    if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;
  }

  // Sharpe Ratio estimation (assuming risk-free rate 0)
  let sharpeRatio = 0;
  if (returns.length > 1) {
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      sharpeRatio = Number(((meanReturn / stdDev) * Math.sqrt(252)).toFixed(2));
    }
  }

  // Exit Counts
  const exitCounts = {
    takeProfit: trades.filter((t) => t.exitReason === "TAKE_PROFIT").length,
    stopLoss: trades.filter((t) => t.exitReason === "STOP_LOSS").length,
    trailingStop: trades.filter((t) => t.exitReason === "TRAILING_STOP").length,
    breakEven: trades.filter((t) => t.exitReason === "BREAK_EVEN").length,
    endOfData: trades.filter((t) => t.exitReason === "END_OF_DATA").length,
    ambiguousIntrabar: trades.filter((t) => t.isAmbiguousIntrabar).length,
  };

  // Overfitting and Fragility Detection Flags
  const overfittingFlags: string[] = [];
  if (totalTrades < 20) {
    overfittingFlags.push(`Small sample size (${totalTrades} trades). Statistical significance is low.`);
  }

  if (wins.length > 0) {
    const bestTradeProfit = Math.max(...wins.map((w) => w.netProfitDollars));
    if (grossProfitDollars > 0 && bestTradeProfit / grossProfitDollars > 0.35) {
      overfittingFlags.push(
        `High outlier dependency: Single best trade ($${bestTradeProfit}) represents ${Math.round((bestTradeProfit / grossProfitDollars) * 100)}% of total gross profit.`
      );
    }
  }

  if (maxDrawdownPercent > 20.0) {
    overfittingFlags.push(`Excessive drawdown: Peak-to-trough decline reached ${maxDrawdownPercent.toFixed(1)}%.`);
  }

  if (exitCounts.ambiguousIntrabar > totalTrades * 0.15) {
    overfittingFlags.push(
      `High intrabar ambiguity: ${exitCounts.ambiguousIntrabar} trades touched both SL and TP in the same candle.`
    );
  }

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    initialBalance,
    finalBalance,
    netProfitDollars,
    netProfitPercent,
    netProfitPoints: Number(netProfitPoints.toFixed(2)),
    grossProfitDollars: Number(grossProfitDollars.toFixed(2)),
    grossLossDollars: Number(grossLossDollars.toFixed(2)),
    profitFactor,
    expectancyR,
    maxDrawdownDollars: Number(maxDrawdownDollars.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    sharpeRatio,
    averageWinDollars,
    averageLossDollars,
    averageR,
    averageDurationMinutes,
    exitCounts,
    overfittingFlags,
  };
}

/**
 * Execute chronological backtest simulation isolating entry strategy from exit trailing variants
 */
export async function runAdvancedBacktest(params: AdvancedBacktestParams): Promise<AdvancedBacktestResult> {
  const symbol = params.symbol || "GOLD";
  const timeframe = params.timeframe || "5m";
  const initialBalance = params.initialBalance || 10000;
  const riskPercent = params.riskPercent || 1.0;
  const trailingVariant = params.trailingVariant || "EXISTING_ASYMMETRIC";
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Execution Costs
  const costSettings: ExecutionCostSettings = {
    ...DEFAULT_COST_SETTINGS,
    ...(params.costs || {}),
  };
  const spec: BrokerSymbolSpec = DEFAULT_GOLD_SPEC;

  // Feature Flags
  const featureStructuralStop = params.featureStructuralStop !== false;
  const featureEntryConfirmation = params.featureEntryConfirmation !== false;
  const featureContextPatternFilter = params.featureContextPatternFilter !== false;
  const featureSpreadGuard = params.featureSpreadGuard !== false;
  const featureSessionFilter = params.featureSessionFilter !== false;
  const tpRatio = params.tpRatio || 2.5;

  logger.info(
    { symbol, timeframe, trailingVariant, initialBalance, runId },
    "[AdvancedBacktestEngine] Starting quantitative backtest"
  );

  // 1. Fetch chronological historical candles from SQLite
  const candles = queryAsOHLCCandles({
    symbol,
    timeframe,
    startTime: params.startTime,
    endTime: params.endTime,
    limit: 50000,
  });

  if (!candles || candles.length < 50) {
    throw new Error(
      `Insufficient stored historical candles for ${symbol} on ${timeframe} (found ${candles?.length || 0}). Please sync historical data from MetaApi first.`
    );
  }

  // 2. Chronological Dataset Split (Train 60%, Validation 20%, Test 20%)
  const trainPct = (params.trainSplitPct ?? 60) / 100;
  const valPct = (params.valSplitPct ?? 20) / 100;
  const totalCount = candles.length;

  const trainCutoffIdx = Math.floor(totalCount * trainPct);
  const valCutoffIdx = Math.floor(totalCount * (trainPct + valPct));

  const trades: BacktestTradeRecord[] = [];
  let runningBalance = initialBalance;

  // Warm-up buffer for technical indicators
  const warmup = 35;
  let i = warmup;

  while (i < candles.length - 2) {
    const currentSlice = candles.slice(0, i + 1);
    const curr = candles[i];
    const currDate = new Date(curr.timestampMs);
    const utcH = currDate.getUTCHours();
    const utcM = currDate.getUTCMinutes();
    const totalMinutes = utcH * 60 + utcM;

    // Determine current dataset split phase
    let currentPhase: "TRAIN" | "VALIDATION" | "TEST" = "TRAIN";
    if (i >= valCutoffIdx) {
      currentPhase = "TEST";
    } else if (i >= trainCutoffIdx) {
      currentPhase = "VALIDATION";
    }

    // 1. Session Filter
    if (featureSessionFilter) {
      const isLondonNY = utcH >= 7 && utcH < 17;
      const isRollover = totalMinutes >= 21 * 60 + 45 && totalMinutes <= 22 * 60 + 30;
      const isAsian = utcH >= 22 || utcH < 7;
      if (!isLondonNY || isRollover || isAsian) {
        i++;
        continue;
      }
    }

    // 2. Technical Indicators (Computed only on closed bars up to current bar i)
    const closes = currentSlice.map((c) => c.close);
    const atr = calcATR(currentSlice, 14);
    if (!atr || atr <= 0.2) {
      i++;
      continue;
    }

    const ema9Series = calcEMA(closes, 9);
    const ema21Series = calcEMA(closes, 21);
    const ema50Series = calcEMA(closes, 50);

    const lastEma9 = ema9Series[ema9Series.length - 1];
    const lastEma21 = ema21Series[ema21Series.length - 1];
    const lastEma50 = ema50Series[ema50Series.length - 1];

    const rsiSeries = calcRSI(closes, 14);
    const lastRsi = rsiSeries[rsiSeries.length - 1];

    const candleResult = detectCandlePattern(currentSlice, atr);
    const orderBlocks = detectOrderBlocks(currentSlice);
    const rangeInfo = analyzeMarketRange(currentSlice);

    const isTrendBullish = lastEma9 > lastEma21 && curr.close > lastEma50;
    const isTrendBearish = lastEma9 < lastEma21 && curr.close < lastEma50;

    let signalDir: "LONG" | "SHORT" | null = null;
    let patternName = candleResult.pattern || "Trend Flow";

    // Confluence logic matching signalEngine
    if (candleResult.pattern !== null && candleResult.bias !== null) {
      if (featureContextPatternFilter) {
        const isDoji = candleResult.pattern === "Dragonfly Doji" || candleResult.pattern === "Gravestone Doji";
        if (isDoji) {
          const inOB = (orderBlocks.bullishOB?.inZone || orderBlocks.bearishOB?.inZone) ?? false;
          const atSR = candleResult.confluenceMet || isNearSR(curr.close, currentSlice, atr);
          if (!inOB && !atSR) {
            i++;
            continue;
          }
        }

        if (candleResult.pattern === "Bullish Engulfing" || candleResult.pattern === "Hammer") {
          if (!isTrendBullish && lastEma9 < lastEma21) {
            i++;
            continue;
          }
        } else if (candleResult.pattern === "Bearish Engulfing" || candleResult.pattern === "Shooting Star") {
          if (!isTrendBearish && lastEma9 > lastEma21) {
            i++;
            continue;
          }
        }
      }

      signalDir = candleResult.bias === "BULLISH" ? "LONG" : "SHORT";
    } else if (isTrendBullish && lastRsi >= 42 && lastRsi <= 62) {
      signalDir = "LONG";
      patternName = "EMA Trend Follow";
    } else if (isTrendBearish && lastRsi >= 38 && lastRsi <= 58) {
      signalDir = "SHORT";
      patternName = "EMA Trend Follow";
    }

    if (!signalDir) {
      i++;
      continue;
    }

    // 3. Entry Confirmation Check
    let entryBarIndex = i;
    if (featureEntryConfirmation) {
      const nextBar1 = candles[i + 1];
      if (!nextBar1) break;

      let confirmed = false;
      if (signalDir === "LONG" && nextBar1.close > curr.high) {
        confirmed = true;
        entryBarIndex = i + 1;
      } else if (signalDir === "SHORT" && nextBar1.close < curr.low) {
        confirmed = true;
        entryBarIndex = i + 1;
      } else {
        const nextBar2 = candles[i + 2];
        if (nextBar2) {
          if (signalDir === "LONG" && nextBar2.close > curr.high) {
            confirmed = true;
            entryBarIndex = i + 2;
          } else if (signalDir === "SHORT" && nextBar2.close < curr.low) {
            confirmed = true;
            entryBarIndex = i + 2;
          }
        }
      }

      if (!confirmed) {
        i++;
        continue;
      }
    }

    // Next realistic available price (e.g. Next bar open)
    const entryCandle = candles[entryBarIndex];
    const entryExecution = calculateEntryExecution(
      signalDir,
      entryCandle.open,
      entryCandle.spread,
      costSettings,
      spec
    );
    const entryPrice = entryExecution.executionPrice;

    // 4. Initial SL and TP Calculation
    let slDist: number;
    let initialStopLoss: number;

    if (featureStructuralStop) {
      const lookbackStart = Math.max(0, entryBarIndex - 10);
      const recent10 = candles.slice(lookbackStart, entryBarIndex + 1);

      if (signalDir === "LONG") {
        const lowestLow = Math.min(...recent10.map((c) => c.low));
        const rawSl = lowestLow - 0.5 * atr - entryExecution.spreadPoints;
        slDist = Math.max(3.5, Math.min(9.0, entryPrice - rawSl));
        initialStopLoss = Number((entryPrice - slDist).toFixed(spec.digits));
      } else {
        const highestHigh = Math.max(...recent10.map((c) => c.high));
        const rawSl = highestHigh + 0.5 * atr + entryExecution.spreadPoints;
        slDist = Math.max(3.5, Math.min(9.0, rawSl - entryPrice));
        initialStopLoss = Number((entryPrice + slDist).toFixed(spec.digits));
      }
    } else {
      slDist = Math.max(3.5, Math.min(9.0, atr * 3.0));
      initialStopLoss =
        signalDir === "LONG"
          ? Number((entryPrice - slDist).toFixed(spec.digits))
          : Number((entryPrice + slDist).toFixed(spec.digits));
    }

    // 5. Spread Guard
    if (featureSpreadGuard) {
      const spreadRatio = slDist > 0 ? entryExecution.spreadPoints / slDist : 0;
      if (spreadRatio > 0.08 || entryExecution.spreadPoints > 0.6) {
        i = entryBarIndex + 1;
        continue;
      }
    }

    const tpDist = Number((slDist * tpRatio).toFixed(spec.digits));
    let initialTakeProfit =
      signalDir === "LONG"
        ? Number((entryPrice + tpDist).toFixed(spec.digits))
        : Number((entryPrice - tpDist).toFixed(spec.digits));

    // Position Sizing: Risk % or Fixed Lots
    const riskAmount = runningBalance * (riskPercent / 100);
    const rawVolume = params.fixedVolume || Math.max(0.01, Math.floor((riskAmount / (slDist * spec.contractSize)) * 100) / 100);
    const volume = Math.min(spec.maxVolume, Math.max(spec.minVolume, rawVolume));

    // 6. Chronological Trade Life Cycle & Trailing Stop Engine
    let currentSl = initialStopLoss;
    let currentTp = initialTakeProfit;
    let peakFavorablePrice = entryPrice;
    let maePoints = 0;
    let mfePoints = 0;
    let isAmbiguous = false;
    let runnerUnlocked = false;

    let exitCandle: (typeof candles)[0] | null = null;
    let exitPrice = entryPrice;
    let exitReason: BacktestTradeRecord["exitReason"] = "END_OF_DATA";

    let stepBarIdx = entryBarIndex + 1;
    while (stepBarIdx < candles.length) {
      const bar = candles[stepBarIdx];

      // Update MFE / MAE
      if (signalDir === "LONG") {
        const adverse = entryPrice - bar.low;
        const favorable = bar.high - entryPrice;
        if (adverse > maePoints) maePoints = adverse;
        if (favorable > mfePoints) mfePoints = favorable;
        if (bar.high > peakFavorablePrice) peakFavorablePrice = bar.high;
      } else {
        const adverse = bar.high - entryPrice;
        const favorable = entryPrice - bar.low;
        if (adverse > maePoints) maePoints = adverse;
        if (favorable > mfePoints) mfePoints = favorable;
        if (bar.low < peakFavorablePrice) peakFavorablePrice = bar.low;
      }

      // Check Intrabar SL / TP Collisions
      const collision = resolveIntrabarCollision({
        direction: signalDir,
        candleHigh: bar.high,
        candleLow: bar.low,
        stopLoss: currentSl,
        takeProfit: currentTp,
        policy: costSettings.intrabarAmbiguityPolicy,
      });

      if (collision.isAmbiguous) isAmbiguous = true;

      if (collision.resolvedOutcome === "TAKE_PROFIT") {
        exitCandle = bar;
        exitPrice = currentTp;
        exitReason = "TAKE_PROFIT";
        break;
      } else if (collision.resolvedOutcome === "STOP_LOSS") {
        exitCandle = bar;
        exitPrice = currentSl;
        exitReason =
          (signalDir === "LONG" && currentSl >= entryPrice) || (signalDir === "SHORT" && currentSl <= entryPrice)
            ? "BREAK_EVEN"
            : currentSl !== initialStopLoss
            ? "TRAILING_STOP"
            : "STOP_LOSS";
        break;
      }

      // ── Trailing Stop Experiment Module Variant Updates ──
      const peakProfit = signalDir === "LONG" ? peakFavorablePrice - entryPrice : entryPrice - peakFavorablePrice;

      switch (trailingVariant) {
        case "NO_TRAILING":
          // Static stops remain unchanged
          break;

        case "FIXED_DISTANCE": {
          const trailDist = params.fixedTrailingDistance || 5.0;
          if (peakProfit >= trailDist) {
            const newSl =
              signalDir === "LONG"
                ? Number((peakFavorablePrice - trailDist).toFixed(spec.digits))
                : Number((peakFavorablePrice + trailDist).toFixed(spec.digits));

            if (signalDir === "LONG" && newSl > currentSl) currentSl = newSl;
            if (signalDir === "SHORT" && newSl < currentSl) currentSl = newSl;
          }
          break;
        }

        case "ATR_BASED": {
          const atrMult = params.atrTrailingMultiplier || 2.0;
          const trailDist = Math.max(3.0, atr * atrMult);
          if (peakProfit >= trailDist) {
            const newSl =
              signalDir === "LONG"
                ? Number((peakFavorablePrice - trailDist).toFixed(spec.digits))
                : Number((peakFavorablePrice + trailDist).toFixed(spec.digits));

            if (signalDir === "LONG" && newSl > currentSl) currentSl = newSl;
            if (signalDir === "SHORT" && newSl < currentSl) currentSl = newSl;
          }
          break;
        }

        case "BREAKEVEN_THEN_TRAILING": {
          const beTrigger = params.breakevenTriggerPoints || 3.0;
          if (peakProfit >= beTrigger) {
            const bePrice =
              signalDir === "LONG"
                ? Number((entryPrice + entryExecution.spreadPoints + 0.1).toFixed(spec.digits))
                : Number((entryPrice - entryExecution.spreadPoints - 0.1).toFixed(spec.digits));

            if (signalDir === "LONG" && bePrice > currentSl) currentSl = bePrice;
            if (signalDir === "SHORT" && bePrice < currentSl) currentSl = bePrice;

            // Trail 4 points behind once past breakeven
            if (peakProfit >= beTrigger + 2.0) {
              const newSl =
                signalDir === "LONG"
                  ? Number((peakFavorablePrice - 4.0).toFixed(spec.digits))
                  : Number((peakFavorablePrice + 4.0).toFixed(spec.digits));
              if (signalDir === "LONG" && newSl > currentSl) currentSl = newSl;
              if (signalDir === "SHORT" && newSl < currentSl) currentSl = newSl;
            }
          }
          break;
        }

        case "PROFIT_TRIGGERED": {
          const profitTrigger = params.profitTriggerPoints || 6.0;
          if (peakProfit >= profitTrigger) {
            const newSl =
              signalDir === "LONG"
                ? Number((peakFavorablePrice - 4.5).toFixed(spec.digits))
                : Number((peakFavorablePrice + 4.5).toFixed(spec.digits));
            if (signalDir === "LONG" && newSl > currentSl) currentSl = newSl;
            if (signalDir === "SHORT" && newSl < currentSl) currentSl = newSl;
          }
          break;
        }

        case "EXISTING_ASYMMETRIC":
        default: {
          // Replicates the live bot's asymmetric runner engine
          if (!runnerUnlocked && peakProfit >= tpDist * 0.85) {
            runnerUnlocked = true;
            // Expand TP target
            const extension = Math.max(tpDist * 3.5, 25.0);
            currentTp =
              signalDir === "LONG"
                ? Number((entryPrice + extension).toFixed(spec.digits))
                : Number((entryPrice - extension).toFixed(spec.digits));
          }

          if (runnerUnlocked) {
            // Tiered runner trailing
            if (peakProfit >= 38.0) {
              const t3 = signalDir === "LONG" ? peakFavorablePrice - 15.0 : peakFavorablePrice + 15.0;
              currentSl = signalDir === "LONG" ? Math.max(currentSl, t3) : Math.min(currentSl, t3);
            } else if (peakProfit >= 22.0) {
              const t2 = signalDir === "LONG" ? peakFavorablePrice - 10.0 : peakFavorablePrice + 10.0;
              currentSl = signalDir === "LONG" ? Math.max(currentSl, t2) : Math.min(currentSl, t2);
            } else if (peakProfit >= 12.0) {
              const t1 = signalDir === "LONG" ? peakFavorablePrice - 7.0 : peakFavorablePrice + 7.0;
              currentSl = signalDir === "LONG" ? Math.max(currentSl, t1) : Math.min(currentSl, t1);
            }
          } else if (peakProfit >= 10.0) {
            // Lock 50% of profit
            const halfLock = signalDir === "LONG" ? entryPrice + peakProfit * 0.5 : entryPrice - peakProfit * 0.5;
            currentSl = signalDir === "LONG" ? Math.max(currentSl, halfLock) : Math.min(currentSl, halfLock);
          } else if (peakProfit >= 1.5) {
            // Breakeven lock
            const beLock = signalDir === "LONG" ? entryPrice + entryExecution.spreadPoints + 0.2 : entryPrice - entryExecution.spreadPoints - 0.2;
            currentSl = signalDir === "LONG" ? Math.max(currentSl, beLock) : Math.min(currentSl, beLock);
          }
          break;
        }
      }

      stepBarIdx++;
    }

    if (!exitCandle) {
      exitCandle = candles[candles.length - 1];
      exitPrice = exitCandle.close;
      exitReason = "END_OF_DATA";
    }

    // 7. Calculate Realistic Costs and Net PnL
    const exitExecution = calculateExitExecution(
      signalDir,
      exitPrice,
      exitCandle.spread,
      costSettings,
      spec
    );

    const durationHours = Math.max(
      0.1,
      (exitCandle.timestampMs - entryCandle.timestampMs) / 3600000
    );

    const pnlCalc = calculateMoneyPnL({
      direction: signalDir,
      entryPrice,
      exitPrice: exitExecution.executionPrice,
      volume,
      durationHours,
      settings: costSettings,
      spec,
    });

    runningBalance += pnlCalc.netProfitDollars;

    const rOutcome = slDist > 0 ? Number((pnlCalc.pnlPoints / slDist).toFixed(2)) : 0;
    const outcome = pnlCalc.netProfitDollars > 0 ? "WIN" : "LOSS";

    trades.push({
      id: `bt_${trades.length + 1}`,
      splitPhase: currentPhase,
      signalTime: new Date(curr.timestampMs).toISOString(),
      entryTime: new Date(entryCandle.timestampMs).toISOString(),
      exitTime: new Date(exitCandle.timestampMs).toISOString(),
      direction: signalDir,
      entryPrice,
      exitPrice: exitExecution.executionPrice,
      stopLoss: initialStopLoss,
      takeProfit: initialTakeProfit,
      pnlPoints: pnlCalc.pnlPoints,
      netProfitDollars: pnlCalc.netProfitDollars,
      commissionDollars: pnlCalc.commissionDollars,
      slippagePoints: entryExecution.slippagePoints + exitExecution.slippagePoints,
      outcome,
      rOutcome,
      maePoints: Number(maePoints.toFixed(2)),
      mfePoints: Number(mfePoints.toFixed(2)),
      durationMinutes: Math.round(durationHours * 60),
      pattern: patternName,
      session: getSessionName(utcH),
      regime: rangeInfo.isRanging ? "RANGING" : "TRENDING",
      exitReason,
      isAmbiguousIntrabar: isAmbiguous,
      balanceAfter: Number(runningBalance.toFixed(2)),
    });

    // Advance index to the bar following trade exit to prevent overlapping trades
    i = Math.max(i + 1, stepBarIdx);
  }

  // 8. Calculate Overall and Split-Phase Performance Metrics
  const overallMetrics = calculatePerformanceMetrics(trades, initialBalance);

  const trainTrades = trades.filter((t) => t.splitPhase === "TRAIN");
  const valTrades = trades.filter((t) => t.splitPhase === "VALIDATION");
  const testTrades = trades.filter((t) => t.splitPhase === "TEST");

  const trainCandles = candles.slice(0, trainCutoffIdx);
  const valCandles = candles.slice(trainCutoffIdx, valCutoffIdx);
  const testCandles = candles.slice(valCutoffIdx);

  const splits: SplitPhaseReport[] = [
    {
      phase: "TRAIN",
      candleCount: trainCandles.length,
      startDate: trainCandles[0] ? new Date(trainCandles[0].timestampMs).toISOString().split("T")[0] : "N/A",
      endDate: trainCandles[trainCandles.length - 1] ? new Date(trainCandles[trainCandles.length - 1].timestampMs).toISOString().split("T")[0] : "N/A",
      metrics: calculatePerformanceMetrics(trainTrades, initialBalance),
    },
    {
      phase: "VALIDATION",
      candleCount: valCandles.length,
      startDate: valCandles[0] ? new Date(valCandles[0].timestampMs).toISOString().split("T")[0] : "N/A",
      endDate: valCandles[valCandles.length - 1] ? new Date(valCandles[valCandles.length - 1].timestampMs).toISOString().split("T")[0] : "N/A",
      metrics: calculatePerformanceMetrics(valTrades, initialBalance),
    },
    {
      phase: "TEST",
      candleCount: testCandles.length,
      startDate: testCandles[0] ? new Date(testCandles[0].timestampMs).toISOString().split("T")[0] : "N/A",
      endDate: testCandles[testCandles.length - 1] ? new Date(testCandles[testCandles.length - 1].timestampMs).toISOString().split("T")[0] : "N/A",
      metrics: calculatePerformanceMetrics(testTrades, initialBalance),
    },
  ];

  // Out of Sample Degradation Check
  const trainPf = splits[0].metrics.profitFactor;
  const testPf = splits[2].metrics.profitFactor;
  if (trainPf > 1.2 && testPf < 1.0) {
    overallMetrics.overfittingFlags.push(
      `Severe out-of-sample degradation: Strategy was profitable in training (PF ${trainPf}), but unprofitable in unseen test period (PF ${testPf}).`
    );
  } else if (trainPf > 1.5 && (trainPf - testPf) / trainPf > 0.4) {
    overallMetrics.overfittingFlags.push(
      `Noticeable test degradation: Out-of-sample Profit Factor (${testPf}) dropped by over 40% compared to training (${trainPf}).`
    );
  }

  // 9. Monthly Breakdown
  const monthsMap = new Map<string, BacktestTradeRecord[]>();
  for (const t of trades) {
    const m = t.entryTime.substring(0, 7); // YYYY-MM
    const list = monthsMap.get(m) || [];
    list.push(t);
    monthsMap.set(m, list);
  }

  const monthlyBreakdown = Array.from(monthsMap.entries()).map(([month, mTrades]) => {
    const wins = mTrades.filter((t) => t.outcome === "WIN").length;
    const netDollars = mTrades.reduce((acc, t) => acc + t.netProfitDollars, 0);
    const grossP = mTrades.filter((t) => t.netProfitDollars > 0).reduce((acc, t) => acc + t.netProfitDollars, 0);
    const grossL = mTrades.filter((t) => t.netProfitDollars < 0).reduce((acc, t) => acc + Math.abs(t.netProfitDollars), 0);
    return {
      month,
      trades: mTrades.length,
      winRate: Number(((wins / mTrades.length) * 100).toFixed(1)),
      netProfitDollars: Number(netDollars.toFixed(2)),
      profitFactor: grossL > 0 ? Number((grossP / grossL).toFixed(2)) : grossP > 0 ? 99 : 0,
    };
  });

  // 10. Session Breakdown
  const sessions = ["London", "New York", "Asian", "London/NY Overlap", "Off-hours"] as const;
  const sessionBreakdown = sessions.map((sess) => {
    const sTrades = trades.filter((t) => t.session === sess);
    const wins = sTrades.filter((t) => t.outcome === "WIN").length;
    const netDollars = sTrades.reduce((acc, t) => acc + t.netProfitDollars, 0);
    const grossP = sTrades.filter((t) => t.netProfitDollars > 0).reduce((acc, t) => acc + t.netProfitDollars, 0);
    const grossL = sTrades.filter((t) => t.netProfitDollars < 0).reduce((acc, t) => acc + Math.abs(t.netProfitDollars), 0);
    return {
      session: sess,
      trades: sTrades.length,
      winRate: sTrades.length > 0 ? Number(((wins / sTrades.length) * 100).toFixed(1)) : 0,
      netProfitDollars: Number(netDollars.toFixed(2)),
      profitFactor: grossL > 0 ? Number((grossP / grossL).toFixed(2)) : grossP > 0 ? 99 : 0,
    };
  });

  // 11. Equity Curve
  let curveBalance = initialBalance;
  let peak = initialBalance;
  const equityCurve = [
    {
      time: candles[0] ? new Date(candles[0].timestampMs).toISOString() : new Date().toISOString(),
      tradeIndex: 0,
      balance: initialBalance,
      drawdownPercent: 0,
    },
    ...trades.map((t, idx) => {
      curveBalance += t.netProfitDollars;
      if (curveBalance > peak) peak = curveBalance;
      const ddPct = peak > 0 ? Number((((peak - curveBalance) / peak) * 100).toFixed(2)) : 0;
      return {
        time: t.exitTime,
        tradeIndex: idx + 1,
        balance: Number(curveBalance.toFixed(2)),
        drawdownPercent: ddPct,
      };
    }),
  ];

  const result: AdvancedBacktestResult = {
    runId,
    strategyName: "Multi-Timeframe SMC Trend Scalper",
    strategyVersion: "v1.0.0-QUANT",
    symbol,
    timeframe,
    evaluatedCandles: candles.length,
    overallMetrics,
    splits,
    monthlyBreakdown,
    sessionBreakdown,
    equityCurve,
    trades,
    trailingVariantUsed: trailingVariant,
  };

  // Persist run metadata into SQLite
  try {
    saveBacktestRun({
      id: runId,
      strategyName: result.strategyName,
      strategyVersion: result.strategyVersion,
      symbol,
      timeframe,
      startTime: candles[0] ? new Date(candles[0].timestampMs).toISOString() : "",
      endTime: candles[candles.length - 1] ? new Date(candles[candles.length - 1].timestampMs).toISOString() : "",
      candleCount: candles.length,
      initialBalance,
      configSnapshot: params,
      costAssumptions: costSettings,
      summaryMetrics: overallMetrics,
      tradesCount: trades.length,
    });
  } catch (saveErr) {
    logger.warn({ err: saveErr }, "[AdvancedBacktestEngine] Could not persist run to SQLite");
  }

  return result;
}

/**
 * Trailing Stop Experiment Module:
 * Run all 6 trailing stop variants on the identical dataset and return side-by-side comparison
 */
export async function runTrailingStopExperiment(
  params: Omit<AdvancedBacktestParams, "trailingVariant">
): Promise<{
  symbol: string;
  timeframe: string;
  candleCount: number;
  variants: {
    variant: TrailingStopVariant;
    label: string;
    description: string;
    metrics: PerformanceMetrics;
    equityCurve: { tradeIndex: number; balance: number }[];
  }[];
}> {
  const variants: { variant: TrailingStopVariant; label: string; description: string }[] = [
    {
      variant: "NO_TRAILING",
      label: "Fixed Stop & Target",
      description: "Baseline: Initial Stop-Loss and Take-Profit remain static until exit.",
    },
    {
      variant: "FIXED_DISTANCE",
      label: "Fixed-Distance Trail",
      description: "Trails a constant point distance behind peak favorable price.",
    },
    {
      variant: "ATR_BASED",
      label: "ATR Volatility Trail",
      description: "Trails dynamically using current ATR multiplier.",
    },
    {
      variant: "BREAKEVEN_THEN_TRAILING",
      label: "Breakeven + Trail",
      description: "Moves stop to Breakeven (+ spread buffer) after initial profit, then trails.",
    },
    {
      variant: "PROFIT_TRIGGERED",
      label: "Profit-Triggered Trail",
      description: "Activates trailing stop only after trade reaches profit milestone.",
    },
    {
      variant: "EXISTING_ASYMMETRIC",
      label: "Asymmetric Runner (Live Bot)",
      description: "Unlocks 25+ pt runner target at 85% TP with multi-tiered trailing stops.",
    },
  ];

  const results: any[] = [];

  for (const v of variants) {
    const res = await runAdvancedBacktest({
      ...params,
      trailingVariant: v.variant,
    });

    results.push({
      variant: v.variant,
      label: v.label,
      description: v.description,
      metrics: res.overallMetrics,
      equityCurve: res.equityCurve.map((c) => ({
        tradeIndex: c.tradeIndex,
        balance: c.balance,
      })),
    });
  }

  return {
    symbol: params.symbol || "GOLD",
    timeframe: params.timeframe || "5m",
    candleCount: results[0]?.metrics?.totalTrades ? 5000 : 0,
    variants: results,
  };
}
