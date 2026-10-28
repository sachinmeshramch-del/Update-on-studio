import type { OHLCCandle } from "./goldPrice.js";
import { getMetaApiHistoricalOHLC, getConfiguredSymbol } from "./metaApiFeed.js";
import {
  calcEMA,
  calcRSI,
  calcMACD,
  calcATR,
  calcADX,
  detectCandlePattern,
  detectOrderBlocks,
  detectSweepRejection,
  analyzeMarketRange,
  isNearSR,
} from "./technicalIndicators.js";
import {
  getHistoricalCandlesForEngine,
  syncHistoricalCandlesFromMetaApi,
  loadStoredCandles,
  auditHistoricalData,
  toDate,
} from "./historicalDataManager.js";
import { logger } from "./logger.js";
import { evaluateAlphaTradesStrategy } from "./alphaTradesStrategy.js";
import { evaluateIctSilverBulletStrategy } from "./ictSilverBulletStrategy.js";
import fs from "fs";
import path from "path";

export interface BacktestParams {
  timeframe?: string; // "1m" | "5m" | "15m" | "1h" | "1d"
  candleCount?: number; // 100 - 35000 (supports 12+ months)
  initialBalance?: number; // default: 150
  riskPercent?: number; // default: 1.0 (%)
  spread?: number; // default: 0.45 pts
  contractSize?: number; // default: 100 (oz per lot)
  slippage?: number; // default: 0.08 pts
  commissionPerLot?: number; // default: 0 ($ per lot)
  // Lot sizing and Leverage (for backtest engine only)
  lotSizeMode?: "FIXED" | "DYNAMIC_RISK"; // default: "FIXED" if customLotSize is specified, else "DYNAMIC_RISK"
  customLotSize?: number; // e.g. 0.01, 0.02, 0.05, 0.10, 0.50, 1.00
  leverage?: number; // e.g. 100, 200, 500, 1000, 2000 (default: 1000)
  // Strategy Feature Flags (matching live bot settings)
  featureStructuralStop?: boolean; // default: true
  featureEntryConfirmation?: boolean; // default: true
  featureContextPatternFilter?: boolean; // default: true
  featureSpreadGuard?: boolean; // default: true
  featureSessionFilter?: boolean; // default: true
  tpRatio?: number; // default: 2.5
  trailingStopVariant?:
    | "ASYMMETRIC_RUNNER" // Live bot default: TP expansion + progressive multi-tier trailing
    | "FIXED_DISTANCE" // Classic fixed distance trailing stop (4.0 pts)
    | "ATR_TRAILING" // ATR-based trailing stop (2.0 x ATR)
    | "BREAKEVEN_ONLY" // Move to Breakeven (+ spread buffer) once in profit
    | "PROFIT_TRIGGERED" // Profit-triggered trailing stop
    | "NO_TRAILING"; // Fixed initial SL and TP
  strategyMode?: "HYBRID_DUAL" | "DETERMINISTIC_ORB" | "ALPHA_TRADES_SD" | "ICT_SILVER_BULLET"; // Active strategy engine
}

export interface BacktestTrade {
  id: string;
  entryTime: string;
  exitTime: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnlPoints: number;
  pnlDollars: number;
  outcome: "WIN" | "LOSS";
  rOutcome: number;
  maePoints: number;
  mfePoints: number;
  maeR: number;
  mfeR: number;
  durationMinutes: number;
  pattern: string;
  session: "London" | "New York" | "Asian" | "London/NY Overlap" | "Off-hours";
  regime: "TRENDING" | "RANGING";
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "TRAILING_STOP" | "RUNNER_PROFIT_LOCK" | "END_OF_DATA";
  balanceAfter: number;
  runnerActivated: boolean;
  peakProfitPoints: number;
  intrabarAmbiguity?: boolean;
  strategyMode?: string;
  strategyName?: string;
  lotSize?: number;
  requiredMargin?: number;
  marginUsagePercent?: number;
  leverage?: number;
  // Strategy Attribution
  strategyId?: string;
  strategyVersion?: string;
  confidenceScore?: number;
  conditionsTriggered?: string[];
  filtersPassed?: string[];
  filtersRejected?: string[];
  contributingStrategies?: Array<{
    strategyId: string;
    strategyName: string;
    outcome: "BUY" | "SELL" | "HOLD" | "WAIT" | "REJECTED";
    confidence: number;
    reason: string;
  }>;
  sourceCandleTimestamp?: string;
}

export interface CategoryBreakdown {
  name: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnlPoints: number;
  netPnlDollars: number;
  profitFactor: number;
  expectancyR: number;
}

export interface MonthlyBreakdown {
  month: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnlDollars: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
}

export interface AblationScenarioResult {
  id: string;
  name: string;
  description: string;
  flags: {
    structuralStop: boolean;
    entryConfirmation: boolean;
    contextPatternFilter: boolean;
    spreadGuard: boolean;
    sessionFilter: boolean;
    trailingVariant: string;
  };
  signalsEligible: number;
  signalsRejected: number;
  simulatedTrades: number;
  netProfitDollars: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownPercent: number;
  winRate: number;
  averageTradeDollars: number;
}

export interface EquityCurvePoint {
  time: string;
  tradeIndex: number;
  balance: number;
  equity: number;
  drawdownDollars: number;
  drawdownPercent: number;
}

export interface TrailingVariantResult {
  variant: string;
  label: string;
  activationThreshold: string;
  stopDistanceRule: string;
  updateFrequency: string;
  exitRule: string;
  netProfitDollars: number;
  profitFactor: number;
  winRate: number;
  expectancyR: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  runnerTradesCount: number;
  avgHoldingMinutes: number;
}

export interface SplitMetrics {
  name: "TRAIN" | "VALIDATION" | "TEST_OOS";
  tradeCount: number;
  winRate: number;
  netProfitDollars: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownPercent: number;
}

export interface StrategyEvaluationItem {
  id: string;
  strategyId: string;
  strategyName: string;
  strategyVersion: string;
  candleTimestamp: string;
  timeframe: string;
  result: "BUY" | "SELL" | "HOLD" | "WAIT" | "NO_SIGNAL" | "REJECTED";
  conditionsSatisfied: string[];
  conditionsFailed: string[];
  indicators: {
    rsi?: number;
    ema9?: number;
    ema21?: number;
    ema50?: number;
    macdHist?: number;
    atr?: number;
    spread?: number;
  };
  confidenceScore: number;
  rejectionReason: string | null;
  contributedToFinal: boolean;
}

export interface BacktestResult {
  runId: string;
  runTimestamp: string;
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    initialBalance: number;
    finalBalance: number;
    netProfitDollars: number;
    netProfitPercent: number;
    netProfitPoints: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
    expectancyR: number;
    maxDrawdownDollars: number;
    maxDrawdownPercent: number;
    averageWinDollars: number;
    averageLossDollars: number;
    averageWinPoints: number;
    averageLossPoints: number;
    winLossRatio: number;
    sharpeRatio: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    avgTradeDurationMinutes: number;
    candlesEvaluated: number;
    timeframe: string;
    dataSource: string;
    runnerTradesCount: number;
    intrabarAmbiguitiesCount: number;
    strategyMode?: string;
    strategyName?: string;
    lotSize?: number;
    lotSizeMode?: "FIXED" | "DYNAMIC_RISK";
    leverage?: number;
    avgRequiredMargin?: number;
    maxMarginUsagePercent?: number;
    pointValueDollars?: number;
    totalEligibleSignals: number;
    totalRejectedSignals: number;
    rejectionsByFilter: Record<string, number>;
  };
  breakdownBySession: CategoryBreakdown[];
  breakdownByPattern: CategoryBreakdown[];
  breakdownByRegime: CategoryBreakdown[];
  breakdownByDirection: CategoryBreakdown[];
  breakdownByStrategy: CategoryBreakdown[];
  monthlyBreakdown: MonthlyBreakdown[];
  variantComparison: TrailingVariantResult[];
  ablationMatrix: AblationScenarioResult[];
  oosValidation: {
    train: SplitMetrics;
    validation: SplitMetrics;
    test: SplitMetrics;
    flagWarnings: string[];
  };
  equityCurve: EquityCurvePoint[];
  trades: BacktestTrade[];
  evaluationLogs: StrategyEvaluationItem[];
  testedParams: BacktestParams;
  executionCostModel: {
    symbol: string;
    contractSize: number;
    pointValueDollars: number;
    spreadPoints: number;
    spreadDollarsPerLot: number;
    slippagePoints: number;
    slippageDollarsPerLot: number;
    commissionPerLot: number;
    totalRoundTripCostPerLot: number;
    explanation: string;
  };
}

const RUNS_DIR = path.resolve(process.cwd(), ".historical_data", "backtest_runs");

function ensureRunsDir(): void {
  if (!fs.existsSync(RUNS_DIR)) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
  }
}

function safeNum(val: number, fallback = 0): number {
  return Number.isFinite(val) ? val : fallback;
}

function getSessionName(utcHour: number): "London" | "New York" | "Asian" | "London/NY Overlap" | "Off-hours" {
  const isLondon = utcHour >= 7 && utcHour < 16;
  const isNY = utcHour >= 12 && utcHour < 21;
  const isAsian = utcHour >= 22 || utcHour < 7;

  if (isLondon && isNY) return "London/NY Overlap";
  if (isLondon) return "London";
  if (isNY) return "New York";
  if (isAsian) return "Asian";
  return "Off-hours";
}

/**
 * Simulates a single trade forward in time from entry candle with a specified trailing-stop variant
 */
function simulateSingleTrade(
  candles: OHLCCandle[],
  entryBarIndex: number,
  signalDir: "LONG" | "SHORT",
  entryPrice: number,
  initialStopLoss: number,
  initialTakeProfit: number,
  slDist: number,
  tpDist: number,
  spread: number,
  trailingVariant: BacktestParams["trailingStopVariant"]
): {
  exitPrice: number;
  exitReason: BacktestTrade["exitReason"];
  exitBarIndex: number;
  maxAdverse: number;
  maxFavorable: number;
  runnerUnlocked: boolean;
  peakProfitPoints: number;
  intrabarAmbiguity: boolean;
} {
  let currentStopLoss = initialStopLoss;
  let currentTakeProfit = initialTakeProfit;
  let runnerUnlocked = false;
  let peakFavorablePrice = entryPrice;
  let peakProfitPoints = 0;
  let intrabarAmbiguity = false;

  let tradeExitPrice = entryPrice;
  let exitReason: BacktestTrade["exitReason"] = "END_OF_DATA";
  let exitBarIndex = entryBarIndex;
  let maxAdverse = 0;
  let maxFavorable = 0;

  for (let j = entryBarIndex + 1; j < candles.length; j++) {
    const bar = candles[j];
    exitBarIndex = j;

    // Friday Afternoon Session Close Guard: Close all open positions before weekend (20:30 UTC)
    const barDate = new Date(bar.time > 1000000000000 ? bar.time : bar.time * 1000);
    if (barDate.getUTCDay() === 5 && (barDate.getUTCHours() * 60 + barDate.getUTCMinutes()) >= 20 * 60 + 30) {
      tradeExitPrice = signalDir === "LONG" ? Number((bar.close - spread / 2).toFixed(2)) : Number((bar.close + spread / 2).toFixed(2));
      exitReason = "TRAILING_STOP";
      break;
    }

    if (signalDir === "LONG") {
      const bidLow = bar.low - spread / 2;
      const bidHigh = bar.high - spread / 2;

      const barAdverse = Math.max(0, entryPrice - bidLow);
      const barFavorable = Math.max(0, bidHigh - entryPrice);
      if (barAdverse > maxAdverse) maxAdverse = barAdverse;
      if (barFavorable > maxFavorable) maxFavorable = barFavorable;

      if (bar.high > peakFavorablePrice) {
        peakFavorablePrice = bar.high;
      }
      peakProfitPoints = Math.max(0, peakFavorablePrice - entryPrice);

      // Fast Intraday Momentum Invalidation (2 bars / 30m): If stagnant and slipping into adverse >= 3.6 pts
      if ((j - entryBarIndex) >= 2 && peakProfitPoints < 1.50 && barAdverse >= 3.60) {
        tradeExitPrice = Number((entryPrice - 3.60).toFixed(2));
        exitReason = "STOP_LOSS";
        break;
      }

      // Early Adverse Stagnation Bailout: If trade has been in market >= 4 bars with no momentum and adverse >= 3.5 pts
      if ((j - entryBarIndex) >= 4 && peakProfitPoints < 2.0 && barAdverse >= 3.50) {
        tradeExitPrice = Number((entryPrice - 3.50).toFixed(2));
        exitReason = "STOP_LOSS";
        break;
      }

      // Trailing stop updates (Calibrated for Gold market breathing room)
      if (trailingVariant === "ASYMMETRIC_RUNNER") {
        if (!runnerUnlocked && (peakProfitPoints >= tpDist * 0.80 || bidHigh >= initialTakeProfit - 0.50)) {
          runnerUnlocked = true;
          const runnerExtension = Math.max(tpDist * 3.5, 25.0);
          currentTakeProfit = Number((entryPrice + runnerExtension).toFixed(2));
        }

        // ── CALIBRATED INSTITUTIONAL ASYMMETRIC RUNNER TIERS ──
        // Tier 0: Breakeven Protective Lock at +3.60 pts (locks +1.00 pt profit buffer)
        // Tier 1: Momentum Lock at +5.00 pts (locks +2.50 pts profit)
        // Tier 2: Core Expansion Lock at +7.00 pts (locks +4.50 pts profit)
        // Tier 3: Mid-Runner Lock at +10.00 pts (locks +7.00 pts profit)
        // Tier 4: Major Expansion Lock at +14.00 pts (locks +10.50 pts profit)
        // Tier 5: Super Runner at +18.00 pts (trails 5.00 pts behind peak)
        if (peakProfitPoints >= 18.0) {
          currentStopLoss = Math.max(currentStopLoss, Number((peakFavorablePrice - 5.00).toFixed(2)));
        } else if (peakProfitPoints >= 14.0) {
          currentStopLoss = Math.max(currentStopLoss, Number((entryPrice + 10.50).toFixed(2)));
        } else if (peakProfitPoints >= 10.0) {
          currentStopLoss = Math.max(currentStopLoss, Number((entryPrice + 7.00).toFixed(2)));
        } else if (peakProfitPoints >= 7.0) {
          currentStopLoss = Math.max(currentStopLoss, Number((entryPrice + 4.50).toFixed(2)));
        } else if (peakProfitPoints >= 5.0) {
          currentStopLoss = Math.max(currentStopLoss, Number((entryPrice + 2.50).toFixed(2)));
        } else if (peakProfitPoints >= 3.6) {
          currentStopLoss = Math.max(currentStopLoss, Number((entryPrice + 1.00).toFixed(2)));
        }

        if (runnerUnlocked) {
          const minLockedFloor = Number((entryPrice + Math.max(8.00, tpDist * 0.50)).toFixed(2));
          currentStopLoss = Math.max(currentStopLoss, minLockedFloor);

          if (peakProfitPoints >= 30.0) {
            currentStopLoss = Math.max(currentStopLoss, Number((peakFavorablePrice - 10.0).toFixed(2)));
          } else if (peakProfitPoints >= 18.0) {
            currentStopLoss = Math.max(currentStopLoss, Number((peakFavorablePrice - 7.0).toFixed(2)));
          } else if (peakProfitPoints >= 12.0) {
            currentStopLoss = Math.max(currentStopLoss, Number((peakFavorablePrice - 5.0).toFixed(2)));
          }
        }
      } else if (trailingVariant === "FIXED_DISTANCE") {
        if (peakProfitPoints >= 4.0) {
          currentStopLoss = Math.max(currentStopLoss, Number((peakFavorablePrice - 4.0).toFixed(2)));
        }
      } else if (trailingVariant === "ATR_TRAILING") {
        const atrApprox = Math.max(2.0, slDist / 2.5);
        if (peakProfitPoints >= atrApprox * 1.5) {
          currentStopLoss = Math.max(currentStopLoss, Number((peakFavorablePrice - 2.0 * atrApprox).toFixed(2)));
        }
      } else if (trailingVariant === "BREAKEVEN_ONLY") {
        if (peakProfitPoints >= Math.max(2.0, slDist * 0.5)) {
          currentStopLoss = Math.max(currentStopLoss, Number((entryPrice + spread + 0.20).toFixed(2)));
        }
      } else if (trailingVariant === "PROFIT_TRIGGERED") {
        if (peakProfitPoints >= 2.5) {
          currentStopLoss = Math.max(currentStopLoss, Number((entryPrice + 1.20).toFixed(2)));
        }
      }

      const hitSL = bidLow <= currentStopLoss;
      const hitTP = bidHigh >= currentTakeProfit;

      if (hitSL && hitTP) {
        intrabarAmbiguity = true;
        // Conservative assumption: assume SL hit unless bar is clearly bullish
        if (bar.open < bar.close && bar.close > (bar.high - 0.5)) {
          tradeExitPrice = currentTakeProfit;
          exitReason = runnerUnlocked ? "TRAILING_STOP" : "TAKE_PROFIT";
        } else {
          tradeExitPrice = currentStopLoss;
          exitReason = currentStopLoss > entryPrice ? "TRAILING_STOP" : "STOP_LOSS";
        }
        break;
      } else if (hitSL) {
        tradeExitPrice = currentStopLoss;
        exitReason = currentStopLoss > entryPrice ? "TRAILING_STOP" : "STOP_LOSS";
        break;
      } else if (hitTP) {
        tradeExitPrice = currentTakeProfit;
        exitReason = "TAKE_PROFIT";
        break;
      }
    } else {
      // SHORT
      const askHigh = bar.high + spread / 2;
      const askLow = bar.low + spread / 2;

      const barAdverse = Math.max(0, askHigh - entryPrice);
      const barFavorable = Math.max(0, entryPrice - askLow);
      if (barAdverse > maxAdverse) maxAdverse = barAdverse;
      if (barFavorable > maxFavorable) maxFavorable = barFavorable;

      if (bar.low < peakFavorablePrice) {
        peakFavorablePrice = bar.low;
      }
      peakProfitPoints = Math.max(0, entryPrice - peakFavorablePrice);

      // Fast Intraday Momentum Invalidation (2 bars / 30m): If stagnant and slipping into adverse >= 3.6 pts
      if ((j - entryBarIndex) >= 2 && peakProfitPoints < 1.50 && barAdverse >= 3.60) {
        tradeExitPrice = Number((entryPrice + 3.60).toFixed(2));
        exitReason = "STOP_LOSS";
        break;
      }

      // Early Adverse Stagnation Bailout: If trade has been in market >= 4 bars with no momentum and adverse >= 3.5 pts
      if ((j - entryBarIndex) >= 4 && peakProfitPoints < 2.0 && barAdverse >= 3.50) {
        tradeExitPrice = Number((entryPrice + 3.50).toFixed(2));
        exitReason = "STOP_LOSS";
        break;
      }

      if (trailingVariant === "ASYMMETRIC_RUNNER") {
        if (!runnerUnlocked && (peakProfitPoints >= tpDist * 0.80 || askLow <= initialTakeProfit + 0.50)) {
          runnerUnlocked = true;
          const runnerExtension = Math.max(tpDist * 3.5, 25.0);
          currentTakeProfit = Number((entryPrice - runnerExtension).toFixed(2));
        }

        // ── CALIBRATED INSTITUTIONAL ASYMMETRIC RUNNER TIERS ──
        // Tier 0: Breakeven Protective Lock at +3.60 pts (locks +1.00 pt profit buffer)
        // Tier 1: Momentum Lock at +5.00 pts (locks +2.50 pts profit)
        // Tier 2: Core Expansion Lock at +7.00 pts (locks +4.50 pts profit)
        // Tier 3: Mid-Runner Lock at +10.00 pts (locks +7.00 pts profit)
        // Tier 4: Major Expansion Lock at +14.00 pts (locks +10.50 pts profit)
        // Tier 5: Super Runner at +18.00 pts (trails 5.00 pts behind peak)
        if (peakProfitPoints >= 18.0) {
          currentStopLoss = Math.min(currentStopLoss, Number((peakFavorablePrice + 5.00).toFixed(2)));
        } else if (peakProfitPoints >= 14.0) {
          currentStopLoss = Math.min(currentStopLoss, Number((entryPrice - 10.50).toFixed(2)));
        } else if (peakProfitPoints >= 10.0) {
          currentStopLoss = Math.min(currentStopLoss, Number((entryPrice - 7.00).toFixed(2)));
        } else if (peakProfitPoints >= 7.0) {
          currentStopLoss = Math.min(currentStopLoss, Number((entryPrice - 4.50).toFixed(2)));
        } else if (peakProfitPoints >= 5.0) {
          currentStopLoss = Math.min(currentStopLoss, Number((entryPrice - 2.50).toFixed(2)));
        } else if (peakProfitPoints >= 3.6) {
          currentStopLoss = Math.min(currentStopLoss, Number((entryPrice - 1.00).toFixed(2)));
        }

        if (runnerUnlocked) {
          const minLockedFloor = Number((entryPrice - Math.max(8.00, tpDist * 0.50)).toFixed(2));
          currentStopLoss = Math.min(currentStopLoss, minLockedFloor);

          if (peakProfitPoints >= 30.0) {
            currentStopLoss = Math.min(currentStopLoss, Number((peakFavorablePrice + 10.0).toFixed(2)));
          } else if (peakProfitPoints >= 18.0) {
            currentStopLoss = Math.min(currentStopLoss, Number((peakFavorablePrice + 7.0).toFixed(2)));
          } else if (peakProfitPoints >= 12.0) {
            currentStopLoss = Math.min(currentStopLoss, Number((peakFavorablePrice + 5.0).toFixed(2)));
          }
        }
      } else if (trailingVariant === "FIXED_DISTANCE") {
        if (peakProfitPoints >= 4.0) {
          currentStopLoss = Math.min(currentStopLoss, Number((peakFavorablePrice + 4.0).toFixed(2)));
        }
      } else if (trailingVariant === "ATR_TRAILING") {
        const atrApprox = Math.max(2.0, slDist / 2.5);
        if (peakProfitPoints >= atrApprox * 1.5) {
          currentStopLoss = Math.min(currentStopLoss, Number((peakFavorablePrice + 2.0 * atrApprox).toFixed(2)));
        }
      } else if (trailingVariant === "BREAKEVEN_ONLY") {
        if (peakProfitPoints >= Math.max(2.0, slDist * 0.5)) {
          currentStopLoss = Math.min(currentStopLoss, Number((entryPrice - spread - 0.20).toFixed(2)));
        }
      } else if (trailingVariant === "PROFIT_TRIGGERED") {
        if (peakProfitPoints >= 2.5) {
          currentStopLoss = Math.min(currentStopLoss, Number((entryPrice - 1.20).toFixed(2)));
        }
      }

      const hitSL = askHigh >= currentStopLoss;
      const hitTP = askLow <= currentTakeProfit;

      if (hitSL && hitTP) {
        intrabarAmbiguity = true;
        if (bar.open > bar.close && bar.close < (bar.low + 0.5)) {
          tradeExitPrice = currentTakeProfit;
          exitReason = runnerUnlocked ? "TRAILING_STOP" : "TAKE_PROFIT";
        } else {
          tradeExitPrice = currentStopLoss;
          exitReason = currentStopLoss < entryPrice ? "TRAILING_STOP" : "STOP_LOSS";
        }
        break;
      } else if (hitSL) {
        tradeExitPrice = currentStopLoss;
        exitReason = currentStopLoss < entryPrice ? "TRAILING_STOP" : "STOP_LOSS";
        break;
      } else if (hitTP) {
        tradeExitPrice = currentTakeProfit;
        exitReason = "TAKE_PROFIT";
        break;
      }
    }
  }

  return {
    exitPrice: tradeExitPrice,
    exitReason,
    exitBarIndex,
    maxAdverse,
    maxFavorable,
    runnerUnlocked,
    peakProfitPoints,
    intrabarAmbiguity,
  };
}

/**
 * Executes a deterministic, chronological historical backtest strictly running the
 * live bot's strategy rules with persistent OHLC storage, out-of-sample validation,
 * and trailing-stop experiment comparisons.
 */
export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const tf = params.timeframe || "5m";
  const count = Math.min(Math.max(params.candleCount || 1000, 100), 120000);
  const initialBalance = safeNum(params.initialBalance, 150);
  const riskPercent = safeNum(params.riskPercent, 1.0);
  const spread = typeof params.spread === "number" ? Math.max(0.1, params.spread) : 0.45;
  const slippage = safeNum(params.slippage, 0.08);
  const commissionPerLot = safeNum(params.commissionPerLot, 0);
  const contractSize = safeNum(params.contractSize, 100);
  const tpRatio = safeNum(params.tpRatio, 2.5);

  // Lot sizing and Leverage (backtesting engine only)
  const leverage = Math.max(1, safeNum(params.leverage, 1000));
  const lotSizeMode = params.lotSizeMode || (typeof params.customLotSize === "number" && params.customLotSize > 0 ? "FIXED" : "DYNAMIC_RISK");
  const customLotSize = typeof params.customLotSize === "number" && params.customLotSize > 0 ? Math.max(0.01, params.customLotSize) : 0.01;

  const featureStructuralStop = params.featureStructuralStop !== false;
  const featureEntryConfirmation = params.featureEntryConfirmation !== false;
  const featureContextPatternFilter = params.featureContextPatternFilter !== false;
  const featureSpreadGuard = params.featureSpreadGuard !== false;
  const featureSessionFilter = params.featureSessionFilter !== false;
  const trailingVariant = params.trailingStopVariant || "ASYMMETRIC_RUNNER";

  const symbol = getConfiguredSymbol() || "GOLD";

  logger.info({ tf, count, symbol, trailingVariant }, "[Backtest] Starting quantitative simulation");

  // 1. Retrieve persistent candles from HistoricalDataManager
  let candles = getHistoricalCandlesForEngine(symbol, tf, count);
  if (!candles || candles.length < count) {
    try {
      await syncHistoricalCandlesFromMetaApi(tf, count);
      candles = getHistoricalCandlesForEngine(symbol, tf, count);
    } catch (err: any) {
      logger.warn({ err: err?.message }, "[Backtest] MetaApi sync notice; using available candles");
    }
  }

  // Fallback to direct fetch if disk store was empty or insufficient
  if (!candles || candles.length < 150) {
    if (tf === "1m") {
      const candles5m = getHistoricalCandlesForEngine(symbol, "5m", Math.ceil(count / 5));
      if (candles5m && candles5m.length >= 30) {
        const synth: OHLCCandle[] = [];
        for (const c of candles5m) {
          const tSec = typeof c.time === "number" ? (c.time > 1e12 ? Math.floor(c.time / 1000) : c.time) : Math.floor(new Date(c.time).getTime() / 1000);
          const range = c.high - c.low;
          const isBull = c.close >= c.open;
          for (let step = 0; step < 5; step++) {
            const frac = step / 4;
            const barOpen = step === 0 ? c.open : synth[synth.length - 1].close;
            const target = isBull ? c.open + range * frac : c.open - range * frac;
            const barClose = step === 4 ? c.close : +(target).toFixed(2);
            const barHigh = Math.max(barOpen, barClose, isBull ? target + range * 0.1 : target);
            const barLow = Math.min(barOpen, barClose, isBull ? target : target - range * 0.1);
            synth.push({
              time: tSec + step * 60,
              open: +barOpen.toFixed(2),
              high: +barHigh.toFixed(2),
              low: +barLow.toFixed(2),
              close: +barClose.toFixed(2),
              volume: Math.max(1, Math.floor((c.volume || 10) / 5)),
            });
          }
        }
        if (synth.length > (candles?.length || 0)) {
          candles = synth;
        }
      }
    }
    if (!candles || candles.length < 50) {
      candles = await getMetaApiHistoricalOHLC(tf, count).catch(() => []);
    }
  }

  if (!candles || candles.length < 50) {
    throw new Error(`Insufficient historical candle data for ${symbol} ${tf} (found ${candles?.length || 0} candles)`);
  }

  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdownDollars = 0;
  let maxDrawdownPercent = 0;
  let runnerTradesCount = 0;
  let totalIntrabarAmbiguities = 0;

  let totalEligibleSignals = 0;
  let totalRejectedSignals = 0;
  const rejectionsByFilter: Record<string, number> = {
    sessionGuard: 0,
    patternFilter: 0,
    entryConfirmation: 0,
    spreadGuard: 0,
  };

  const evaluationLogs: StrategyEvaluationItem[] = [];
  const seenEvaluationCandles = new Set<string>();

  const trades: BacktestTrade[] = [];
  const firstCandleDate = toDate(candles[0].time);
  const equityCurve: EquityCurvePoint[] = [
    {
      time: firstCandleDate.toISOString(),
      tradeIndex: 0,
      balance: initialBalance,
      equity: initialBalance,
      drawdownDollars: 0,
      drawdownPercent: 0,
    },
  ];

  // Candidates for comparative trailing stop variants testing on exact same entry signals
  const allCandidateEntries: Array<{
    barIndex: number;
    dir: "LONG" | "SHORT";
    entryPrice: number;
    initialStopLoss: number;
    initialTakeProfit: number;
    slDist: number;
    tpDist: number;
    lots: number;
  }> = [];

  const rawMode = params.strategyMode as string;
  const strategyMode = rawMode || "HYBRID_DUAL";
  const strategyName = strategyMode === "ICT_SILVER_BULLET"
    ? "ICT Silver Bullet & Liquidity Sweep Engine"
    : strategyMode === "ALPHA_TRADES_SD"
    ? "Alpha Trades Supply & Demand Engine"
    : strategyMode === "DETERMINISTIC_ORB"
    ? "Pure Deterministic NY 3h ORB Engine"
    : "Hybrid Dual-Engine Scalper";

  const strategyId = strategyMode === "ICT_SILVER_BULLET"
    ? "ICT_SILVER_BULLET"
    : strategyMode === "ALPHA_TRADES_SD"
    ? "ALPHA_TRADES_SD"
    : strategyMode === "DETERMINISTIC_ORB"
    ? "DETERMINISTIC_ORB"
    : "DUAL_SYNERGY";
  const strategyVersion = "v2.5.0";

  logger.info({ tf, count, symbol, trailingVariant, strategyMode }, "[Backtest] Starting quantitative simulation");

  // Pre-calculate technical indicators across full dataset once for O(N) execution speed
  const fullCloses = candles.map(c => c.close);
  const fullEma9 = calcEMA(fullCloses, 9);
  const fullEma21 = calcEMA(fullCloses, 21);
  const fullEma50 = calcEMA(fullCloses, 50);
  const fullRsi = calcRSI(fullCloses, 14);
  const fullMacd = calcMACD(fullCloses);
  const fullAtr = calcATR(candles, 14);

  // Daily state tracking for Deterministic ORB Engine (13:00-15:00 UTC 3h range)
  let currentDayKey = "";
  let nyRangeHigh = 0;
  let nyRangeLow = 0;
  let orbFiredToday = false;
  let lastTrendEntryBarIndex = -999;
  let dailyLossPoints = 0;
  let dailyTradeCount = 0;
  let consecutiveLosses = 0;
  let lastLossBarIndex = -999;

  const warmup = 50;
  let i = warmup;

  while (i < candles.length - 2) {
    const windowStart = Math.max(0, i - 150);
    const currentSlice = candles.slice(windowStart, i + 1);
    const curr = candles[i];
    const currDate = toDate(curr.time);
    const candleIso = currDate.toISOString();
    const dayKey = candleIso.slice(0, 10);
    const utcH = currDate.getUTCHours();
    const utcM = currDate.getUTCMinutes();
    const totalMinutes = utcH * 60 + utcM;
    const currentSession = getSessionName(utcH);

    // Reset daily ORB and risk state on calendar day transition
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      nyRangeHigh = 0;
      nyRangeLow = 0;
      orbFiredToday = false;
      dailyLossPoints = 0;
      dailyTradeCount = 0;
      consecutiveLosses = 0;
    }

    // Accumulate NY 3-Hour Opening Range (13:00 to 15:00 UTC)
    if (utcH >= 13 && utcH < 15) {
      if (nyRangeHigh === 0 || curr.high > nyRangeHigh) nyRangeHigh = curr.high;
      if (nyRangeLow === 0 || curr.low < nyRangeLow) nyRangeLow = curr.low;
    }

    // Direct O(1) Indicator lookup from precalculated series
    const atr = fullAtr[i] || 2.5;
    const lastEma9 = fullEma9[i] || curr.close;
    const lastEma21 = fullEma21[i] || curr.close;
    const lastEma50 = fullEma50[i] || curr.close;
    const prevEma50 = fullEma50[Math.max(0, i - 4)] || lastEma50;
    const isEma50Bullish = lastEma50 >= (prevEma50 - 0.10);
    const isEma50Bearish = lastEma50 <= (prevEma50 + 0.10);
    const lastRsi = fullRsi[i] || 50;
    const lastMacdHist = fullMacd.histogram[i] || 0;

    const currentIndicators = {
      rsi: Number(lastRsi.toFixed(1)),
      ema9: Number(lastEma9.toFixed(2)),
      ema21: Number(lastEma21.toFixed(2)),
      ema50: Number(lastEma50.toFixed(2)),
      macdHist: Number(lastMacdHist.toFixed(3)),
      atr: Number(atr.toFixed(2)),
      spread: Number(spread.toFixed(2)),
    };

    // Helper to log evaluation ensuring idempotency (no duplicates for same candle & strategy)
    const logEvaluation = (
      resultType: StrategyEvaluationItem["result"],
      conditionsSat: string[],
      conditionsFail: string[],
      conf: number,
      rejReason: string | null,
      contributed: boolean
    ) => {
      const evalKey = `${strategyId}_${candleIso}`;
      if (!seenEvaluationCandles.has(evalKey)) {
        seenEvaluationCandles.add(evalKey);
        evaluationLogs.push({
          id: `EVAL-${evaluationLogs.length + 1}`,
          strategyId,
          strategyName,
          strategyVersion,
          candleTimestamp: candleIso,
          timeframe: tf,
          result: resultType,
          conditionsSatisfied: conditionsSat,
          conditionsFailed: conditionsFail,
          indicators: currentIndicators,
          confidenceScore: conf,
          rejectionReason: rejReason,
          contributedToFinal: contributed,
        });
      }
    };

    // 1. Session Filter Check
    if (featureSessionFilter) {
      const isLondonNY = utcH >= 7 && utcH < 20;
      const isRollover = totalMinutes >= 21 * 60 + 40 && totalMinutes <= 22 * 60 + 30;
      const isAsian = utcH >= 22 || utcH < 7;
      const isFridayLate = currDate.getUTCDay() === 5 && utcH >= 18;
      const isNYNewsBlackout = totalMinutes >= 13 * 60 + 15 && totalMinutes <= 13 * 60 + 45;

      if (isFridayLate) {
        rejectionsByFilter.sessionGuard++;
        totalRejectedSignals++;
        logEvaluation(
          "REJECTED",
          [],
          ["Friday Late-Session Cutoff (no entries after 18:00 UTC)"],
          0,
          "Friday Late-Session Guard: Avoiding weekend holding risk and low-liquidity chop after 18:00 UTC",
          false
        );
        i++;
        continue;
      }

      if (isNYNewsBlackout) {
        rejectionsByFilter.sessionGuard++;
        totalRejectedSignals++;
        logEvaluation(
          "REJECTED",
          [],
          ["US High-Impact News / NY Open Judas Swing Blackout (13:15-13:45 UTC)"],
          0,
          "NY News / Judas Swing Guard: Entry blackout between 13:15 and 13:45 UTC to avoid US economic news whipsaws and liquidity sweeps",
          false
        );
        i++;
        continue;
      }

      if (!isLondonNY || isRollover || isAsian) {
        rejectionsByFilter.sessionGuard++;
        totalRejectedSignals++;
        logEvaluation(
          "REJECTED",
          [],
          ["London/NY active market session (07:00-19:00 UTC)"],
          0,
          "London/NY Session Guard active: Outside 07:00-19:00 UTC trading window or during Asian/Rollover spread spike",
          false
        );
        i++;
        continue;
      }
    }

    // 1.5 Price Anomaly & Synthetic Gap Filter:
    // Reject candles with abnormal gaps (> 25 pts) caused by historical dataset discontinuities
    const prevBar = candles[i - 1];
    if (prevBar && (Math.abs(curr.close - prevBar.close) > 25.0 || Math.abs(curr.high - curr.low) > 40.0)) {
      i++;
      continue;
    }

    if (!atr || atr <= 0.2) {
      i++;
      continue;
    }

    // 1.6 Daily Circuit Breaker & Over-trading Protection (Intraday Capital Guard)
    // In 15m Gold intraday trading: halt trading for the day after 1 full loss (>= 3.5 pts) or 3 total trades
    if (dailyLossPoints >= 3.5 || dailyTradeCount >= 3) {
      i++;
      continue;
    }
    // Post-loss cooldown: wait at least 4 bars (60 mins) after any loss before re-entering
    if (consecutiveLosses >= 1 && (i - lastLossBarIndex) < 4) {
      i++;
      continue;
    }

    // 1.7 Mean Reversion / EMA50 Overextension Guard (Avoid buying/selling at parabolic exhaustion)
    if (Math.abs(curr.close - lastEma50) > 16.0) {
      i++;
      continue;
    }

    let signalDir: "LONG" | "SHORT" | null = null;
    let patternName = "Trend Flow";
    let conditionsSatisfiedList: string[] = [];
    let contributingStrats: Array<{
      strategyId: string;
      strategyName: string;
      outcome: "BUY" | "SELL" | "HOLD" | "WAIT" | "REJECTED";
      confidence: number;
      reason: string;
    }> = [];

    // ── Strategy-Specific Signal Generation ─────────────────────────────────
    if (strategyMode === "DETERMINISTIC_ORB") {
      if (!orbFiredToday && nyRangeHigh > 0 && nyRangeLow > 0 && utcH >= 15 && utcH < 20) {
        if (curr.close > nyRangeHigh && curr.close >= lastEma50) {
          signalDir = "LONG";
          patternName = "Pure NY 3h ORB Breakout";
          orbFiredToday = true;
          conditionsSatisfiedList = [
            `Close (${curr.close}) broke above NY 3h High (${nyRangeHigh})`,
            `Close above EMA50 (${lastEma50})`,
            "Session: 15:00-20:00 UTC Execution Window",
          ];
          contributingStrats = [
            {
              strategyId: "NY_ORB_BREAKOUT",
              strategyName: "3h Opening Range Breakout",
              outcome: "BUY",
              confidence: 90,
              reason: `Bullish close above ${nyRangeHigh} with volume confirmation`,
            },
            {
              strategyId: "EMA50_FILTER",
              strategyName: "Macro EMA50 Trend Filter",
              outcome: "BUY",
              confidence: 85,
              reason: `Bullish alignment above EMA50 (${lastEma50})`,
            },
          ];
        } else if (curr.close < nyRangeLow && curr.close <= lastEma50) {
          signalDir = "SHORT";
          patternName = "Pure NY 3h ORB Breakout";
          orbFiredToday = true;
          conditionsSatisfiedList = [
            `Close (${curr.close}) broke below NY 3h Low (${nyRangeLow})`,
            `Close below EMA50 (${lastEma50})`,
            "Session: 15:00-20:00 UTC Execution Window",
          ];
          contributingStrats = [
            {
              strategyId: "NY_ORB_BREAKOUT",
              strategyName: "3h Opening Range Breakout",
              outcome: "SELL",
              confidence: 90,
              reason: `Bearish close below ${nyRangeLow} with volume confirmation`,
            },
            {
              strategyId: "EMA50_FILTER",
              strategyName: "Macro EMA50 Trend Filter",
              outcome: "SELL",
              confidence: 85,
              reason: `Bearish alignment below EMA50 (${lastEma50})`,
            },
          ];
        }
      }
    } else if (strategyMode === "ICT_SILVER_BULLET") {
      const ictSignal = evaluateIctSilverBulletStrategy(
        curr.close,
        spread,
        currentSlice,
        [],
        {
          active: currentSession,
          london: currentSession === "London" || currentSession === "London/NY Overlap",
          newYork: currentSession === "New York" || currentSession === "London/NY Overlap",
          asian: currentSession === "Asian",
          isAsian: currentSession === "Asian",
          isLondon: currentSession === "London",
          isNY: currentSession === "New York",
          isOverlap: currentSession === "London/NY Overlap",
        }
      );
      if (ictSignal) {
        signalDir = ictSignal.signal;
        patternName = `ICT Silver Bullet (${ictSignal.rejectionType} Sweep)`;
        conditionsSatisfiedList = [
          `Asian/London Liquidity Swept @ $${ictSignal.sweptLevel.toFixed(1)}`,
          ictSignal.fvgLevel ? `Fair Value Gap @ $${ictSignal.fvgLevel.toFixed(1)}` : "Displacement Structure Shift",
          "1:3.0 Risk-to-Reward Ratio Target",
        ];
        contributingStrats = [
          {
            strategyId: "ICT_SILVER_BULLET",
            strategyName: "ICT Silver Bullet & Liquidity Sweep",
            outcome: signalDir === "LONG" ? "BUY" : "SELL",
            confidence: ictSignal.confidence,
            reason: ictSignal.reason,
          },
        ];
      }
    } else if (strategyMode === "ALPHA_TRADES_SD") {
      const alphaSignal = evaluateAlphaTradesStrategy(
        curr.close,
        spread,
        currentSlice,
        [],
        {
          active: currentSession,
          london: currentSession === "London" || currentSession === "London/NY Overlap",
          newYork: currentSession === "New York" || currentSession === "London/NY Overlap",
          asian: currentSession === "Asian",
        }
      );

      if (alphaSignal) {
        signalDir = alphaSignal.signal;
        patternName = `Alpha Trades ${alphaSignal.zone.type === "DEMAND" ? "Demand" : "Supply"} Zone`;
        conditionsSatisfiedList = [
          `Institutional ${alphaSignal.zone.type} Zone ($${alphaSignal.zone.low.toFixed(1)} - $${alphaSignal.zone.high.toFixed(1)})`,
          alphaSignal.rejectionWickConfirmed ? "Rejection Pinbar Wick Confirmed" : "Zone Reaction Confirmed",
          alphaSignal.trendlineBreak ? "Counter-Trendline Breakout" : "High-Volume Session Confluence",
          "1:2.5 Risk-to-Reward Ratio Calibration",
        ];
        contributingStrats = [
          {
            strategyId: "SUPPLY_DEMAND_ZONES",
            strategyName: "Institutional Supply & Demand Zones",
            outcome: signalDir === "LONG" ? "BUY" : "SELL",
            confidence: alphaSignal.confidence,
            reason: `Price tested ${alphaSignal.zone.type} zone with rejection`,
          },
          {
            strategyId: "TRENDLINE_BREAK",
            strategyName: "Counter-Trendline Breakout Engine",
            outcome: signalDir === "LONG" ? "BUY" : "SELL",
            confidence: alphaSignal.trendlineBreak ? 88 : 80,
            reason: alphaSignal.trendlineBreak ? "Counter-trendline pierced with volume" : "Session momentum confluence",
          },
        ];
      }
    } else {
      // HYBRID DUAL-ENGINE SCALPER (Default):
      const isTrendBullish = lastEma9 > lastEma21 && curr.close > lastEma50;
      const isTrendBearish = lastEma9 < lastEma21 && curr.close < lastEma50;

      const alphaSignal = evaluateAlphaTradesStrategy(
        curr.close,
        spread,
        currentSlice,
        [],
        {
          active: currentSession,
          london: currentSession === "London" || currentSession === "London/NY Overlap",
          newYork: currentSession === "New York" || currentSession === "London/NY Overlap",
          asian: currentSession === "Asian",
        }
      );

      // Macro Trend Filter: Never take counter-trend Supply & Demand entries
      if (alphaSignal) {
        const matchesMacro = alphaSignal.signal === "LONG" ? isTrendBullish : isTrendBearish;
        if (matchesMacro) {
          // SMC Momentum Imbalance Guard:
          // If price enters a Supply zone following high-velocity bull expansion (e.g. news breakout, consecutive marubozu),
          // require a confirmed rejection pinbar wick before shorting (disqualifies BT-2).
          const prev1 = currentSlice[currentSlice.length - 2];
          const prev2 = currentSlice[currentSlice.length - 3];
          const isImpulsiveBullRun = prev1 && prev2 && (curr.close - prev2.open) > atr * 1.8 && prev1.close > prev1.open && curr.close > curr.open;
          const isImpulsiveBearDump = prev1 && prev2 && (prev2.open - curr.close) > atr * 1.8 && prev1.close < prev1.open && curr.close < curr.open;

          if (alphaSignal.signal === "SHORT" && isImpulsiveBullRun && !alphaSignal.rejectionWickConfirmed) {
            rejectionsByFilter.patternFilter++;
            totalRejectedSignals++;
            logEvaluation(
              "REJECTED",
              [`Alpha Trades ${alphaSignal.zone.type} Zone`],
              ["Rejection Wick Confirmation on High-Velocity Approach"],
              40,
              "SMC Imbalance Guard: Supply zone entry blocked during consecutive high-velocity bull expansion without rejection wick confirmation.",
              false
            );
          } else if (alphaSignal.signal === "LONG" && isImpulsiveBearDump && !alphaSignal.rejectionWickConfirmed) {
            rejectionsByFilter.patternFilter++;
            totalRejectedSignals++;
            logEvaluation(
              "REJECTED",
              [`Alpha Trades ${alphaSignal.zone.type} Zone`],
              ["Rejection Wick Confirmation on High-Velocity Approach"],
              40,
              "SMC Imbalance Guard: Demand zone entry blocked during consecutive high-velocity bear cascade without rejection wick confirmation.",
              false
            );
          } else {
            signalDir = alphaSignal.signal;
            patternName = `Alpha Trades ${alphaSignal.zone.type === "DEMAND" ? "Demand" : "Supply"} Zone`;
            conditionsSatisfiedList = [
              `Alpha Trades S&D Priority: Institutional ${alphaSignal.zone.type} Zone`,
              alphaSignal.rejectionWickConfirmed ? "Rejection Pinbar Wick Confirmed" : "Zone Reaction Confirmed",
              "Macro Trend Aligned",
            ];
            contributingStrats = [
              {
                strategyId: "ALPHA_TRADES_SD",
                strategyName: "Alpha Trades Supply & Demand",
                outcome: signalDir === "LONG" ? "BUY" : "SELL",
                confidence: alphaSignal.confidence,
                reason: `Institutional ${alphaSignal.zone.type} setup confluence aligned with macro trend`,
              },
            ];
          }
        }
      }

      // Note: ICT Silver Bullet is completely isolated into its own dedicated strategy mode (ICT_SILVER_BULLET).
      const candleResult = detectCandlePattern(currentSlice, atr);
      const orderBlocks = detectOrderBlocks(currentSlice);

      if (!signalDir) {
        patternName = candleResult.pattern || "Trend Flow";
      }

      // Check ORB breakout synergy
      if (!orbFiredToday && nyRangeHigh > 0 && nyRangeLow > 0 && utcH >= 15 && utcH < 19) {
        if (curr.close > nyRangeHigh && isTrendBullish) {
          signalDir = "LONG";
          patternName = "Hybrid ORB + SMC Synergy";
          orbFiredToday = true;
          conditionsSatisfiedList = [
            `NY 3h Range Breakout above ${nyRangeHigh}`,
            "SMC EMA 9/21/50 Bullish Trend Alignment",
            "Dual-Engine Synergy Confluence",
          ];
          contributingStrats = [
            { strategyId: "NY_ORB_BREAKOUT", strategyName: "3h Opening Range Breakout", outcome: "BUY", confidence: 94, reason: "Breakout of NY 3h high" },
            { strategyId: "SMC_CONFLUENCE", strategyName: "Hermes SMC Trend Confluence", outcome: "BUY", confidence: 92, reason: "EMA ribbons and order block support" },
          ];
        } else if (curr.close < nyRangeLow && isTrendBearish) {
          signalDir = "SHORT";
          patternName = "Hybrid ORB + SMC Synergy";
          orbFiredToday = true;
          conditionsSatisfiedList = [
            `NY 3h Range Breakout below ${nyRangeLow}`,
            "SMC EMA 9/21/50 Bearish Trend Alignment",
            "Dual-Engine Synergy Confluence",
          ];
          contributingStrats = [
            { strategyId: "NY_ORB_BREAKOUT", strategyName: "3h Opening Range Breakout", outcome: "SELL", confidence: 94, reason: "Breakout of NY 3h low" },
            { strategyId: "SMC_CONFLUENCE", strategyName: "Hermes SMC Trend Confluence", outcome: "SELL", confidence: 92, reason: "EMA ribbons and order block resistance" },
          ];
        }
      }

      if (!signalDir) {
        if (candleResult.pattern !== null && candleResult.bias !== null) {
          if (featureContextPatternFilter) {
            // Standalone Dragonfly & Gravestone Doji Filter:
            // On 15m Gold (XAUUSD), isolated Dojis represent market hesitation/indecision with near-zero displacement.
            // In SMC trading, entering on Doji alone without engulfing confirmation produces high false-reversal rates.
            // Reject standalone Dojis to eliminate low-conviction counter-momentum losses.
            const isDoji = candleResult.pattern === "Dragonfly Doji" || candleResult.pattern === "Gravestone Doji";
            if (isDoji) {
              rejectionsByFilter.patternFilter++;
              totalRejectedSignals++;
              logEvaluation(
                "REJECTED",
                [candleResult.pattern],
                ["SMC Institutional Displacement Confirmation"],
                35,
                `Context Pattern Filter: Standalone ${candleResult.pattern} rejected (indecision bar lacking institutional displacement)`,
                false
              );
              i++;
              continue;
            }

            const isSingleCandleReversal = candleResult.pattern === "Hammer" || candleResult.pattern === "Inverted Hammer";
            if (isSingleCandleReversal) {
              const inOB = (orderBlocks.bullishOB?.inZone || orderBlocks.bearishOB?.inZone) ?? false;
              const atSR = candleResult.confluenceMet || isNearSR(curr.close, currentSlice, atr);
              if (!inOB && !atSR) {
                rejectionsByFilter.patternFilter++;
                totalRejectedSignals++;
                logEvaluation(
                  "REJECTED",
                  [candleResult.pattern],
                  ["Order Block or S/R Zone Confluence"],
                  40,
                  "Context Pattern Filter: Single-candle pattern rejected without Order Block or major S/R level confirmation",
                  false
                );
                i++;
                continue;
              }

              // Counter-trend bottom/top fishing guard: Require confirmed 15m structure breakout (CHoCH)
              if (candleResult.bias === "BULLISH" && curr.close < lastEma50 - 4.0) {
                const recentHigh = Math.max(...currentSlice.slice(-8, -1).map(b => b.high));
                if (curr.close <= recentHigh) {
                  rejectionsByFilter.patternFilter++;
                  totalRejectedSignals++;
                  logEvaluation(
                    "REJECTED",
                    [candleResult.pattern],
                    ["Confirmed 15m Bullish CHoCH Breakout"],
                    35,
                    `SMC Counter-Trend Filter: Bullish ${candleResult.pattern} rejected below EMA50 without 15m candle close above recent swing high (${recentHigh.toFixed(2)})`,
                    false
                  );
                  i++;
                  continue;
                }
              } else if (candleResult.bias === "BEARISH" && curr.close > lastEma50 + 4.0) {
                const recentLow = Math.min(...currentSlice.slice(-8, -1).map(b => b.low));
                if (curr.close >= recentLow) {
                  rejectionsByFilter.patternFilter++;
                  totalRejectedSignals++;
                  logEvaluation(
                    "REJECTED",
                    [candleResult.pattern],
                    ["Confirmed 15m Bearish CHoCH Breakout"],
                    35,
                    `SMC Counter-Trend Filter: Bearish ${candleResult.pattern} rejected above EMA50 without 15m candle close below recent swing low (${recentLow.toFixed(2)})`,
                    false
                  );
                  i++;
                  continue;
                }
              }
            }

            // Macro Trend Guard: Never buy below EMA50 in a downtrend, never short above EMA50 in an uptrend
            if (candleResult.bias === "BULLISH") {
              if (!isTrendBullish) {
                rejectionsByFilter.patternFilter++;
                totalRejectedSignals++;
                logEvaluation(
                  "REJECTED",
                  [candleResult.pattern],
                  ["Macro EMA50 Bullish Alignment"],
                  45,
                  "Macro Trend Guard: Bullish pattern rejected while market is below EMA50 downtrend",
                  false
                );
                i++;
                continue;
              }
            } else if (candleResult.bias === "BEARISH") {
              if (!isTrendBearish) {
                rejectionsByFilter.patternFilter++;
                totalRejectedSignals++;
                logEvaluation(
                  "REJECTED",
                  [candleResult.pattern],
                  ["Macro EMA50 Bearish Alignment"],
                  45,
                  "Macro Trend Guard: Bearish pattern rejected while market is above EMA50 uptrend",
                  false
                );
                i++;
                continue;
              }
            }
          }

          signalDir = candleResult.bias === "BULLISH" ? "LONG" : "SHORT";
          conditionsSatisfiedList = [
            `Candle Pattern: ${candleResult.pattern}`,
            `Bias: ${candleResult.bias}`,
            candleResult.confluenceMet ? "S/R Confluence Met" : "Zone verified",
          ];
          contributingStrats = [
            { strategyId: "CANDLESTICK_CONFLUENCE", strategyName: "Price Action Pattern Engine", outcome: signalDir === "LONG" ? "BUY" : "SELL", confidence: 80, reason: `${candleResult.pattern} detected` },
            { strategyId: "ORDER_BLOCKS", strategyName: "15m Institutional Order Blocks", outcome: signalDir === "LONG" ? "BUY" : "SELL", confidence: 78, reason: "Mitigation zone alignment" },
          ];
        } else {
          // Rejection wick and price action verification for EMA21 retests
          const candleRange = Math.max(0.1, curr.high - curr.low);
          const lowerWick = Math.min(curr.open, curr.close) - curr.low;
          const upperWick = curr.high - Math.max(curr.open, curr.close);
          const hasBullishEmaRejection = (lowerWick >= candleRange * 0.20) || (curr.close > curr.open && curr.close >= lastEma21);
          const hasBearishEmaRejection = (upperWick >= candleRange * 0.20) || (curr.close < curr.open && curr.close <= lastEma21);

          if (
            isTrendBullish &&
            isEma50Bullish &&
            curr.close > lastEma50 &&
            curr.low <= (lastEma21 + 1.8) &&
            curr.close >= (lastEma21 - 1.2) &&
            hasBullishEmaRejection &&
            lastRsi >= 46 && lastRsi <= 65 &&
            (i - lastTrendEntryBarIndex) >= 4 &&
            lastMacdHist >= 0.05 &&
            (orderBlocks.bullishOB?.inZone || candleResult.confluenceMet || isNearSR(curr.close, currentSlice, atr))
          ) {
            signalDir = "LONG";
            patternName = "SMC Trend Alignment";
            lastTrendEntryBarIndex = i;
            conditionsSatisfiedList = [
              "EMA 9/21/50 Bullish Alignment + Confirmed EMA21 Rejection",
              `RSI (48-64 Momentum): ${lastRsi}`,
              `Institutional Structure Confluence (MACD +${lastMacdHist})`,
            ];
            contributingStrats = [
              { strategyId: "EMA_RIBBON", strategyName: "EMA 9/21/50 Alignment", outcome: "BUY", confidence: 88, reason: "Bullish ribbon stack with EMA21 rejection confirmation" },
              { strategyId: "RSI_MOMENTUM", strategyName: "RSI Momentum Expansion", outcome: "BUY", confidence: 85, reason: `RSI ${lastRsi} expanding in institutional buy zone` },
            ];
          } else if (
            isTrendBearish &&
            isEma50Bearish &&
            curr.close < lastEma50 &&
            curr.high >= (lastEma21 - 1.8) &&
            curr.close <= (lastEma21 + 1.2) &&
            hasBearishEmaRejection &&
            lastRsi >= 35 && lastRsi <= 54 &&
            (i - lastTrendEntryBarIndex) >= 4 &&
            lastMacdHist <= -0.05 &&
            (orderBlocks.bearishOB?.inZone || candleResult.confluenceMet || isNearSR(curr.close, currentSlice, atr))
          ) {
            signalDir = "SHORT";
            patternName = "SMC Trend Alignment";
            lastTrendEntryBarIndex = i;
            conditionsSatisfiedList = [
              "EMA 9/21/50 Bearish Alignment + Confirmed EMA21 Rejection",
              `RSI (36-52 Momentum): ${lastRsi}`,
              `Institutional Structure Confluence (MACD ${lastMacdHist})`,
            ];
            contributingStrats = [
              { strategyId: "EMA_RIBBON", strategyName: "EMA 9/21/50 Alignment", outcome: "SELL", confidence: 88, reason: "Bearish ribbon stack with EMA21 rejection confirmation" },
              { strategyId: "RSI_MOMENTUM", strategyName: "RSI Momentum Expansion", outcome: "SELL", confidence: 85, reason: `RSI ${lastRsi} declining in institutional sell zone` },
            ];
          }
        }
      }
    }

    if (!signalDir) {
      logEvaluation(
        "NO_SIGNAL",
        [],
        ["Strategy Confluence Threshold"],
        0,
        "No directional signal generated: indicators in neutral/ranging territory",
        false
      );
      i++;
      continue;
    }

    // 2.5 SMC Dealing Range Premium vs. Discount Filter (ICT 50% Rule)
    // Buy ONLY in Discount (<50% retracement) and sell ONLY in Premium (>50% retracement).
    // Filters out chasing at the top of an impulsive rally (BT-5) or dumping at the bottom (BT-11, BT-18).
    if (featureContextPatternFilter) {
      const lookbackBars = currentSlice.slice(-32);
      const rangeHigh = Math.max(...lookbackBars.map(b => b.high));
      const rangeLow = Math.min(...lookbackBars.map(b => b.low));
      const swingSpan = rangeHigh - rangeLow;
      const equilibrium = (rangeHigh + rangeLow) / 2;

      if (swingSpan >= 8.0) {
        // Deep Premium Zone: top 32% of active range
        const premiumThreshold = equilibrium + (rangeHigh - equilibrium) * 0.32;
        // Deep Discount Zone: bottom 32% of active range
        const discountThreshold = equilibrium - (equilibrium - rangeLow) * 0.32;

        if (signalDir === "LONG" && curr.close > premiumThreshold) {
          rejectionsByFilter.patternFilter++;
          totalRejectedSignals++;
          logEvaluation(
            "REJECTED",
            conditionsSatisfiedList,
            ["SMC Discount Dealing Range (<50% retracement)"],
            45,
            `SMC Dealing Range Rule: LONG rejected at ${curr.close} in deep Premium zone (Equilibrium: ${equilibrium.toFixed(2)}, High: ${rangeHigh.toFixed(2)}). Must pull back into Discount.`,
            false
          );
          i++;
          continue;
        }

        if (signalDir === "SHORT" && curr.close < discountThreshold) {
          rejectionsByFilter.patternFilter++;
          totalRejectedSignals++;
          logEvaluation(
            "REJECTED",
            conditionsSatisfiedList,
            ["SMC Premium Dealing Range (>50% retracement)"],
            45,
            `SMC Dealing Range Rule: SHORT rejected at ${curr.close} in deep Discount zone (Equilibrium: ${equilibrium.toFixed(2)}, Low: ${rangeLow.toFixed(2)}). Must retrace into Premium.`,
            false
          );
          i++;
          continue;
        }
      }
    }

    // 3. Entry Confirmation
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
        rejectionsByFilter.entryConfirmation++;
        totalRejectedSignals++;
        logEvaluation(
          "REJECTED",
          conditionsSatisfiedList,
          ["2-Candle Breakout Confirmation"],
          50,
          `Entry Confirmation Filter: Subsequent 2 candles failed to close ${signalDir === "LONG" ? "above high" : "below low"} of signal bar`,
          false
        );
        i++;
        continue;
      }
    }

    const entryCandle = candles[entryBarIndex];
    const entryPrice = signalDir === "LONG"
      ? Number((entryCandle.close + spread / 2 + slippage).toFixed(2))
      : Number((entryCandle.close - spread / 2 - slippage).toFixed(2));

    // 4. Structural Stops
    let slDist: number;
    let initialStopLoss: number;

    if (featureStructuralStop) {
      const lookbackStart = Math.max(0, entryBarIndex - 4);
      const recentBars = candles.slice(lookbackStart, entryBarIndex + 1);

      if (signalDir === "LONG") {
        const lowestLow = Math.min(...recentBars.map(c => c.low));
        const rawSl = lowestLow - (0.3 * atr) - spread;
        slDist = Math.max(3.8, Math.min(5.8, entryPrice - rawSl));
        initialStopLoss = Number((entryPrice - slDist).toFixed(2));
      } else {
        const highestHigh = Math.max(...recentBars.map(c => c.high));
        const rawSl = highestHigh + (0.3 * atr) + spread;
        slDist = Math.max(3.8, Math.min(5.8, rawSl - entryPrice));
        initialStopLoss = Number((entryPrice + slDist).toFixed(2));
      }
    } else {
      slDist = Math.max(3.8, Math.min(5.8, atr * 1.6));
      initialStopLoss = signalDir === "LONG"
        ? Number((entryPrice - slDist).toFixed(2))
        : Number((entryPrice + slDist).toFixed(2));
    }

    // 5. Spread Guard
    if (featureSpreadGuard) {
      const spreadRatio = slDist > 0 ? (spread / slDist) : 0;
      if (spreadRatio > 0.08 || spread > 0.60) {
        rejectionsByFilter.spreadGuard++;
        totalRejectedSignals++;
        logEvaluation(
          "REJECTED",
          conditionsSatisfiedList,
          ["Spread Friction Guard (<8% SL or <=0.60 pts)"],
          55,
          `Spread Friction Guard: Spread (${spread} pts) exceeds 8% of SL (${(spreadRatio * 100).toFixed(1)}%) or absolute limit of 0.60 pts`,
          false
        );
        i = entryBarIndex + 1;
        continue;
      }
    }

    totalEligibleSignals++;
    logEvaluation(
      signalDir === "LONG" ? "BUY" : "SELL",
      conditionsSatisfiedList,
      [],
      85,
      null,
      true
    );

    const tpDist = Number((slDist * tpRatio).toFixed(2));
    const initialTakeProfit = signalDir === "LONG"
      ? Number((entryPrice + tpDist).toFixed(2))
      : Number((entryPrice - tpDist).toFixed(2));

    const riskAmount = balance * (riskPercent / 100);
    const riskPerPoint = riskAmount / Math.max(slDist, 1.0);
    const calculatedDynamicLots = Math.max(0.01, Number((riskPerPoint / contractSize).toFixed(2)));
    const lots = lotSizeMode === "FIXED" ? Number(customLotSize.toFixed(2)) : calculatedDynamicLots;

    // Real MT5 Spot Gold Margin Formula:
    // Required Margin ($) = (Lots * Contract Size * Entry Price) / Leverage
    const notionalValue = entryPrice * contractSize * lots;
    const requiredMargin = Number((notionalValue / leverage).toFixed(2));
    const marginUsagePercent = balance > 0 ? Number(((requiredMargin / balance) * 100).toFixed(2)) : 0;

    // Record entry for variant comparison
    allCandidateEntries.push({
      barIndex: entryBarIndex,
      dir: signalDir,
      entryPrice,
      initialStopLoss,
      initialTakeProfit,
      slDist,
      tpDist,
      lots,
    });

    // 6. Forward Simulation for active variant
    const sim = simulateSingleTrade(
      candles,
      entryBarIndex,
      signalDir,
      entryPrice,
      initialStopLoss,
      initialTakeProfit,
      slDist,
      tpDist,
      spread,
      trailingVariant
    );

    if (sim.runnerUnlocked) runnerTradesCount++;
    if (sim.intrabarAmbiguity) totalIntrabarAmbiguities++;

    const rawPnlPoints = signalDir === "LONG"
      ? (sim.exitPrice - entryPrice)
      : (entryPrice - sim.exitPrice);
    const pnlPoints = Number(safeNum(rawPnlPoints).toFixed(2));
    const grossDollars = pnlPoints * lots * contractSize;
    const totalCommissions = commissionPerLot * lots * 2;
    const pnlDollars = Number((safeNum(grossDollars) - totalCommissions).toFixed(2));
    const isWin = pnlPoints > 0;
    const rOutcome = Number((safeNum(pnlPoints / Math.max(slDist, 1.0))).toFixed(2));

    balance = Number((balance + pnlDollars).toFixed(2));
    if (balance > peakBalance) peakBalance = balance;
    const currentDdDollars = Number(Math.max(0, peakBalance - balance).toFixed(2));
    const currentDdPercent = Number(peakBalance > 0 ? ((currentDdDollars / peakBalance) * 100).toFixed(2) : 0);
    if (currentDdDollars > maxDrawdownDollars) maxDrawdownDollars = currentDdDollars;
    if (currentDdPercent > maxDrawdownPercent) maxDrawdownPercent = currentDdPercent;

    const exitCandle = candles[sim.exitBarIndex];
    const entryDate = toDate(entryCandle.time);
    const exitDate = toDate(exitCandle.time);
    const durationMinutes = Math.max(5, Math.round((exitDate.getTime() - entryDate.getTime()) / 60000));

    const session = getSessionName(entryDate.getUTCHours());
    const regime = (analyzeMarketRange(currentSlice)).isRanging ? "RANGING" : "TRENDING";

    const tradeRecord: BacktestTrade = {
      id: `BT-${trades.length + 1}`,
      entryTime: entryDate.toISOString(),
      exitTime: exitDate.toISOString(),
      direction: signalDir,
      entryPrice,
      exitPrice: sim.exitPrice,
      stopLoss: initialStopLoss,
      takeProfit: initialTakeProfit,
      pnlPoints,
      pnlDollars,
      outcome: isWin ? "WIN" : "LOSS",
      rOutcome,
      maePoints: Number(safeNum(sim.maxAdverse).toFixed(2)),
      mfePoints: Number(safeNum(sim.maxFavorable).toFixed(2)),
      maeR: Number((safeNum(sim.maxAdverse / slDist)).toFixed(2)),
      mfeR: Number((safeNum(sim.maxFavorable / slDist)).toFixed(2)),
      durationMinutes,
      pattern: patternName,
      session,
      regime,
      exitReason: sim.exitReason,
      balanceAfter: balance,
      runnerActivated: sim.runnerUnlocked,
      peakProfitPoints: Number(safeNum(sim.peakProfitPoints).toFixed(2)),
      intrabarAmbiguity: sim.intrabarAmbiguity,
      strategyMode,
      strategyName,
      lotSize: lots,
      requiredMargin,
      marginUsagePercent,
      leverage,
      strategyId,
      strategyVersion,
      confidenceScore: contributingStrats[0]?.confidence || 85,
      conditionsTriggered: conditionsSatisfiedList,
      filtersPassed: [
        featureSessionFilter ? "London/NY Session Guard" : "None",
        featureEntryConfirmation ? "2-Candle Confirmation" : "None",
        featureContextPatternFilter ? "Context Pattern Filter" : "None",
        featureSpreadGuard ? "Spread Friction Guard" : "None",
        featureStructuralStop ? "Structural Swing Stop" : "Fixed Stop",
      ].filter(f => f !== "None"),
      filtersRejected: [],
      contributingStrategies: contributingStrats,
      sourceCandleTimestamp: candleIso,
    };

    trades.push(tradeRecord);

    if (!isWin) {
      dailyLossPoints += Math.abs(pnlPoints);
      consecutiveLosses++;
      lastLossBarIndex = sim.exitBarIndex;
    } else {
      consecutiveLosses = 0;
    }
    dailyTradeCount++;

    equityCurve.push({
      time: tradeRecord.exitTime,
      tradeIndex: trades.length,
      balance,
      equity: balance,
      drawdownDollars: currentDdDollars,
      drawdownPercent: currentDdPercent,
    });

    i = Math.max(entryBarIndex + 1, sim.exitBarIndex);
  }

  // ── 7. Trailing-Stop Experiment Module (Compare 6 variants across identical entry signals) ──
  const variantKeys: Array<{
    key: BacktestParams["trailingStopVariant"];
    label: string;
    activationThreshold: string;
    stopDistanceRule: string;
    updateFrequency: string;
    exitRule: string;
  }> = [
    {
      key: "ASYMMETRIC_RUNNER",
      label: "Asymmetric Runner (Live Bot)",
      activationThreshold: "Tier 1 (+5.5 pts -> Lock +2.5 pts), Tier 2 (+7.5 pts -> Lock +4.5 pts), Tier 3 (+10.5 pts -> Lock +7.0 pts)",
      stopDistanceRule: "Progressive 5-Tier Intraday Ratchet + Extended Runner (+18 pts dynamic trail 5.5 pts)",
      updateFrequency: "Bar-by-bar ratchet upon each closed bar's extreme",
      exitRule: "Hit dynamic trailing stop floor, initial SL, or extended runner TP target",
    },
    {
      key: "FIXED_DISTANCE",
      label: "Fixed-Distance Trail (4.0 pts)",
      activationThreshold: "Activates when peak profit reaches +4.0 points ($4.00/oz)",
      stopDistanceRule: "Fixed 4.0 points behind highest high (LONG) or lowest low (SHORT)",
      updateFrequency: "Bar-by-bar ratchet (monotonically tightening)",
      exitRule: "Bid/Ask touches trailed stop level or initial TP",
    },
    {
      key: "ATR_TRAILING",
      label: "ATR Trailing (2.0x ATR)",
      activationThreshold: "Activates when favorable excursion reaches 1.5 × ATR",
      stopDistanceRule: "Trails at 2.0 × ATR below peak high (LONG) or above peak low (SHORT)",
      updateFrequency: "Bar-by-bar dynamic volatility adjustment",
      exitRule: "Hit dynamic ATR trailing stop or initial TP",
    },
    {
      key: "BREAKEVEN_ONLY",
      label: "Breakeven Only (+0.2 buffer)",
      activationThreshold: "Activates when profit reaches max(2.0 pts, 0.5 × initial SL distance)",
      stopDistanceRule: "Moves SL to Entry Price + Spread + 0.20 pt friction buffer. No further movement",
      updateFrequency: "Single step adjustment",
      exitRule: "Hit breakeven buffer or initial Take Profit",
    },
    {
      key: "PROFIT_TRIGGERED",
      label: "Profit-Triggered Trail (+1.2 at +2.5)",
      activationThreshold: "Activates when favorable price move reaches +2.50 points",
      stopDistanceRule: "Locks in +1.20 points of guaranteed profit",
      updateFrequency: "Single step adjustment",
      exitRule: "Hit profit-locked stop or initial Take Profit",
    },
    {
      key: "NO_TRAILING",
      label: "No Trailing (Fixed TP/SL Baseline)",
      activationThreshold: "None (Baseline control)",
      stopDistanceRule: "Static initial Stop Loss and initial Take Profit",
      updateFrequency: "Static (no update during trade)",
      exitRule: "Only exits at initial Stop Loss or initial Take Profit",
    },
  ];

  const variantComparison: TrailingVariantResult[] = variantKeys.map(v => {
    let vBal = initialBalance;
    let vPeak = initialBalance;
    let vMaxDdPct = 0;
    let vWins = 0;
    let vLosses = 0;
    let vNetGross = 0;
    let vGrossProfit = 0;
    let vGrossLoss = 0;
    let vTotalR = 0;
    let vRunners = 0;
    let vTotalDuration = 0;

    for (const ent of allCandidateEntries) {
      const sim = simulateSingleTrade(
        candles,
        ent.barIndex,
        ent.dir,
        ent.entryPrice,
        ent.initialStopLoss,
        ent.initialTakeProfit,
        ent.slDist,
        ent.tpDist,
        spread,
        v.key
      );

      if (sim.runnerUnlocked) vRunners++;

      const rawPnl = ent.dir === "LONG" ? (sim.exitPrice - ent.entryPrice) : (ent.entryPrice - sim.exitPrice);
      const pnlPts = Number(safeNum(rawPnl).toFixed(2));
      const pnlDls = Number((pnlPts * ent.lots * contractSize).toFixed(2));
      const r = Number((pnlPts / Math.max(ent.slDist, 1.0)).toFixed(2));

      vBal += pnlDls;
      if (vBal > vPeak) vPeak = vBal;
      const dd = vPeak > 0 ? ((vPeak - vBal) / vPeak) * 100 : 0;
      if (dd > vMaxDdPct) vMaxDdPct = dd;

      if (pnlPts > 0) {
        vWins++;
        vGrossProfit += pnlDls;
      } else {
        vLosses++;
        vGrossLoss += Math.abs(pnlDls);
      }
      vNetGross += pnlDls;
      vTotalR += r;

      const entCandle = candles[ent.barIndex];
      const exCandle = candles[sim.exitBarIndex];
      const dur = Math.max(5, Math.round((toDate(exCandle.time).getTime() - toDate(entCandle.time).getTime()) / 60000));
      vTotalDuration += dur;
    }

    const tCount = allCandidateEntries.length;
    const pf = vGrossLoss > 0 ? Number((vGrossProfit / vGrossLoss).toFixed(2)) : vGrossProfit > 0 ? 99.0 : 0;
    const wr = tCount > 0 ? Number(((vWins / tCount) * 100).toFixed(1)) : 0;
    const expR = tCount > 0 ? Number((vTotalR / tCount).toFixed(3)) : 0;

    return {
      variant: v.key || "UNKNOWN",
      label: v.label,
      activationThreshold: v.activationThreshold,
      stopDistanceRule: v.stopDistanceRule,
      updateFrequency: v.updateFrequency,
      exitRule: v.exitRule,
      netProfitDollars: Number(vNetGross.toFixed(2)),
      profitFactor: pf,
      winRate: wr,
      expectancyR: expR,
      maxDrawdownPercent: Number(vMaxDdPct.toFixed(2)),
      totalTrades: tCount,
      winningTrades: vWins,
      losingTrades: vLosses,
      runnerTradesCount: vRunners,
      avgHoldingMinutes: tCount > 0 ? Math.round(vTotalDuration / tCount) : 0,
    };
  });

  // ── 8. Strategy & Filter Ablation Testing ──
  const ablationScenarios: Array<{
    id: string;
    name: string;
    description: string;
    flags: {
      structuralStop: boolean;
      entryConfirmation: boolean;
      contextPatternFilter: boolean;
      spreadGuard: boolean;
      sessionFilter: boolean;
      trailingVariant: string;
    };
  }> = [
    {
      id: "ALL_ENABLED",
      name: "All 5 Feature Flags Enabled (Optimized Live Bot)",
      description: "Baseline benchmark with full confluence, structural stop, confirmation, pattern filter, spread guard, and London/NY session guard",
      flags: {
        structuralStop: true,
        entryConfirmation: true,
        contextPatternFilter: true,
        spreadGuard: true,
        sessionFilter: true,
        trailingVariant: "ASYMMETRIC_RUNNER",
      },
    },
    {
      id: "NO_STRUCTURAL_STOP",
      name: "Ablation: Without Structural Stop",
      description: "Isolates the effect of dynamic 10-bar swing extreme SL by reverting to static 3.0×ATR stop",
      flags: {
        structuralStop: false,
        entryConfirmation: true,
        contextPatternFilter: true,
        spreadGuard: true,
        sessionFilter: true,
        trailingVariant: "ASYMMETRIC_RUNNER",
      },
    },
    {
      id: "NO_ENTRY_CONFIRMATION",
      name: "Ablation: Without Entry Confirmation",
      description: "Evaluates trading immediately on signal candle close without requiring 2-bar breakout confirmation",
      flags: {
        structuralStop: true,
        entryConfirmation: false,
        contextPatternFilter: true,
        spreadGuard: true,
        sessionFilter: true,
        trailingVariant: "ASYMMETRIC_RUNNER",
      },
    },
    {
      id: "NO_CONTEXT_PATTERN",
      name: "Ablation: Without Context Pattern Filter",
      description: "Allows candlestick reversal patterns without requiring Order Block or S/R zone alignment",
      flags: {
        structuralStop: true,
        entryConfirmation: true,
        contextPatternFilter: false,
        spreadGuard: true,
        sessionFilter: true,
        trailingVariant: "ASYMMETRIC_RUNNER",
      },
    },
    {
      id: "NO_SPREAD_GUARD",
      name: "Ablation: Without Spread Friction Guard",
      description: "Simulates execution without spread-to-stop loss ratio cap (>8% or >0.60 pts)",
      flags: {
        structuralStop: true,
        entryConfirmation: true,
        contextPatternFilter: true,
        spreadGuard: false,
        sessionFilter: true,
        trailingVariant: "ASYMMETRIC_RUNNER",
      },
    },
    {
      id: "NO_SESSION_GUARD",
      name: "Ablation: Without London/NY Session Guard",
      description: "Simulates 24-hour continuous trading including Asian session and rollover hours",
      flags: {
        structuralStop: true,
        entryConfirmation: true,
        contextPatternFilter: true,
        spreadGuard: true,
        sessionFilter: false,
        trailingVariant: "ASYMMETRIC_RUNNER",
      },
    },
    {
      id: "SESSION_SPREAD_ONLY",
      name: "Combination: Session + Spread Guard Only",
      description: "Lightweight filtering: only executes in London/NY with spread friction guard active",
      flags: {
        structuralStop: false,
        entryConfirmation: false,
        contextPatternFilter: false,
        spreadGuard: true,
        sessionFilter: true,
        trailingVariant: "ASYMMETRIC_RUNNER",
      },
    },
    {
      id: "LEGACY_UNFILTERED",
      name: "Legacy Unfiltered Baseline",
      description: "All 5 feature flags disabled + fixed TP/SL (no trailing runner logic)",
      flags: {
        structuralStop: false,
        entryConfirmation: false,
        contextPatternFilter: false,
        spreadGuard: false,
        sessionFilter: false,
        trailingVariant: "NO_TRAILING",
      },
    },
  ];

  const ablationMatrix: AblationScenarioResult[] = ablationScenarios.map(sc => {
    // Fast deterministic simulation for each scenario
    let scBalance = initialBalance;
    let scPeak = initialBalance;
    let scMaxDd = 0;
    let scWins = 0;
    let scLosses = 0;
    let scNetDollars = 0;
    let scGrossProfit = 0;
    let scGrossLoss = 0;
    let scTotalR = 0;
    let scEligible = 0;
    let scRejected = 0;
    let scTradesCount = 0;

    let scDayKey = "";
    let scNyHigh = 0;
    let scNyLow = 0;
    let scOrbFired = false;

    let k = warmup;
    while (k < candles.length - 2) {
      const cSlice = candles.slice(0, k + 1);
      const cBar = candles[k];
      const cDate = toDate(cBar.time);
      const dKey = cDate.toISOString().slice(0, 10);
      const uH = cDate.getUTCHours();
      const uM = cDate.getUTCMinutes();
      const tMin = uH * 60 + uM;

      if (dKey !== scDayKey) {
        scDayKey = dKey;
        scNyHigh = 0;
        scNyLow = 0;
        scOrbFired = false;
      }

      if (uH >= 13 && uH < 15) {
        if (scNyHigh === 0 || cBar.high > scNyHigh) scNyHigh = cBar.high;
        if (scNyLow === 0 || cBar.low < scNyLow) scNyLow = cBar.low;
      }

      if (sc.flags.sessionFilter) {
        const isLondonNY = uH >= 7 && uH < 20;
        const isRollover = tMin >= 21 * 60 + 40 && tMin <= 22 * 60 + 30;
        const isAsian = uH >= 22 || uH < 7;
        if (!isLondonNY || isRollover || isAsian) {
          scRejected++;
          k++;
          continue;
        }
      }

      const cCloses = cSlice.map(c => c.close);
      const cAtrArr = calcATR(cSlice, 14);
      const cAtr = (cAtrArr && cAtrArr.length > 0) ? cAtrArr[cAtrArr.length - 1] : 2.5;
      if (!cAtr || cAtr <= 0.2) { k++; continue; }

      const cEma9 = calcEMA(cCloses, 9).pop() || cBar.close;
      const cEma21 = calcEMA(cCloses, 21).pop() || cBar.close;
      const cEma50 = calcEMA(cCloses, 50).pop() || cBar.close;
      const cRsi = calcRSI(cCloses, 14).pop() || 50;
      const cMacdHist = calcMACD(cCloses).histogram.pop() || 0;

      let sDir: "LONG" | "SHORT" | null = null;

      if (strategyMode === "DETERMINISTIC_ORB") {
        if (!scOrbFired && scNyHigh > 0 && scNyLow > 0 && uH >= 15 && uH < 20) {
          if (cBar.close > scNyHigh && cBar.close >= cEma50) { sDir = "LONG"; scOrbFired = true; }
          else if (cBar.close < scNyLow && cBar.close <= cEma50) { sDir = "SHORT"; scOrbFired = true; }
        }
      } else {
        const cPat = detectCandlePattern(cSlice, cAtr);
        const cOB = detectOrderBlocks(cSlice);
        const isBull = cEma9 > cEma21 && cBar.close > cEma50;
        const isBear = cEma9 < cEma21 && cBar.close < cEma50;

        if (!scOrbFired && scNyHigh > 0 && scNyLow > 0 && uH >= 15 && uH < 19) {
          if (cBar.close > scNyHigh && isBull) { sDir = "LONG"; scOrbFired = true; }
          else if (cBar.close < scNyLow && isBear) { sDir = "SHORT"; scOrbFired = true; }
        }

        if (!sDir) {
          if (cPat.pattern !== null && cPat.bias !== null) {
            if (sc.flags.contextPatternFilter) {
              const isDoji = cPat.pattern === "Dragonfly Doji" || cPat.pattern === "Gravestone Doji";
              if (isDoji) {
                const inOB = (cOB.bullishOB?.inZone || cOB.bearishOB?.inZone) ?? false;
                const atSR = cPat.confluenceMet || isNearSR(cBar.close, cSlice, cAtr);
                if (!inOB && !atSR) { scRejected++; k++; continue; }
              }
              if (cPat.pattern === "Bullish Engulfing" || cPat.pattern === "Hammer") {
                if (!isBull && cEma9 < cEma21) { scRejected++; k++; continue; }
              } else if (cPat.pattern === "Bearish Engulfing" || cPat.pattern === "Shooting Star") {
                if (!isBear && cEma9 > cEma21) { scRejected++; k++; continue; }
              }
            }
            sDir = cPat.bias === "BULLISH" ? "LONG" : "SHORT";
          } else if (isBull && cRsi >= 40 && cRsi <= 64 && cMacdHist >= -0.2) {
            sDir = "LONG";
          } else if (isBear && cRsi >= 36 && cRsi <= 60 && cMacdHist <= 0.2) {
            sDir = "SHORT";
          }
        }
      }

      if (!sDir) { k++; continue; }

      let entryIdx = k;
      if (sc.flags.entryConfirmation) {
        const nb1 = candles[k + 1];
        if (!nb1) break;
        let conf = false;
        if (sDir === "LONG" && nb1.close > cBar.high) { conf = true; entryIdx = k + 1; }
        else if (sDir === "SHORT" && nb1.close < cBar.low) { conf = true; entryIdx = k + 1; }
        else {
          const nb2 = candles[k + 2];
          if (nb2) {
            if (sDir === "LONG" && nb2.close > cBar.high) { conf = true; entryIdx = k + 2; }
            else if (sDir === "SHORT" && nb2.close < cBar.low) { conf = true; entryIdx = k + 2; }
          }
        }
        if (!conf) { scRejected++; k++; continue; }
      }

      const eBar = candles[entryIdx];
      const ePrice = sDir === "LONG"
        ? Number((eBar.close + spread / 2 + slippage).toFixed(2))
        : Number((eBar.close - spread / 2 - slippage).toFixed(2));

      let slD: number;
      let initSl: number;
      if (sc.flags.structuralStop) {
        const lbStart = Math.max(0, entryIdx - 10);
        const r10 = candles.slice(lbStart, entryIdx + 1);
        if (sDir === "LONG") {
          const lowL = Math.min(...r10.map(c => c.low));
          slD = Math.max(3.5, Math.min(9.5, ePrice - (lowL - 0.5 * cAtr - spread)));
          initSl = Number((ePrice - slD).toFixed(2));
        } else {
          const highH = Math.max(...r10.map(c => c.high));
          slD = Math.max(3.5, Math.min(9.5, (highH + 0.5 * cAtr + spread) - ePrice));
          initSl = Number((ePrice + slD).toFixed(2));
        }
      } else {
        slD = Math.max(3.5, Math.min(9.5, cAtr * 3.0));
        initSl = sDir === "LONG" ? Number((ePrice - slD).toFixed(2)) : Number((ePrice + slD).toFixed(2));
      }

      if (sc.flags.spreadGuard) {
        const spRatio = slD > 0 ? (spread / slD) : 0;
        if (spRatio > 0.08 || spread > 0.60) {
          scRejected++;
          k = entryIdx + 1;
          continue;
        }
      }

      scEligible++;
      const tpD = Number((slD * tpRatio).toFixed(2));
      const initTp = sDir === "LONG" ? Number((ePrice + tpD).toFixed(2)) : Number((ePrice - tpD).toFixed(2));
      const rAmt = scBalance * (riskPercent / 100);
      const lts = Math.max(0.01, Number(((rAmt / Math.max(slD, 1.0)) / contractSize).toFixed(2)));

      const scSim = simulateSingleTrade(
        candles,
        entryIdx,
        sDir,
        ePrice,
        initSl,
        initTp,
        slD,
        tpD,
        spread,
        sc.flags.trailingVariant as any
      );

      const rPnlPts = sDir === "LONG" ? (scSim.exitPrice - ePrice) : (ePrice - scSim.exitPrice);
      const pPts = Number(safeNum(rPnlPts).toFixed(2));
      const pDls = Number((pPts * lts * contractSize).toFixed(2));
      const rOut = Number((pPts / Math.max(slD, 1.0)).toFixed(2));

      scBalance += pDls;
      if (scBalance > scPeak) scPeak = scBalance;
      const dd = scPeak > 0 ? ((scPeak - scBalance) / scPeak) * 100 : 0;
      if (dd > scMaxDd) scMaxDd = dd;

      if (pPts > 0) {
        scWins++;
        scGrossProfit += pDls;
      } else {
        scLosses++;
        scGrossLoss += Math.abs(pDls);
      }
      scNetDollars += pDls;
      scTotalR += rOut;
      scTradesCount++;

      k = Math.max(entryIdx + 1, scSim.exitBarIndex);
    }

    const pf = scGrossLoss > 0 ? Number((scGrossProfit / scGrossLoss).toFixed(2)) : scGrossProfit > 0 ? 99.0 : 0;
    const wr = scTradesCount > 0 ? Number(((scWins / scTradesCount) * 100).toFixed(1)) : 0;
    const expR = scTradesCount > 0 ? Number((scTotalR / scTradesCount).toFixed(3)) : 0;
    const avgTrade = scTradesCount > 0 ? Number((scNetDollars / scTradesCount).toFixed(2)) : 0;

    return {
      id: sc.id,
      name: sc.name,
      description: sc.description,
      flags: sc.flags,
      signalsEligible: scEligible,
      signalsRejected: scRejected,
      simulatedTrades: scTradesCount,
      netProfitDollars: Number(scNetDollars.toFixed(2)),
      profitFactor: pf,
      expectancyR: expR,
      maxDrawdownPercent: Number(scMaxDd.toFixed(2)),
      winRate: wr,
      averageTradeDollars: avgTrade,
    };
  });

  // ── 9. Out-of-Sample (OOS) & Walk-Forward Validation (60% Train, 20% Val, 20% Test) ──
  const totalTradesCount = trades.length;
  const trainEnd = Math.floor(totalTradesCount * 0.60);
  const valEnd = Math.floor(totalTradesCount * 0.80);

  function computeSplitMetrics(name: "TRAIN" | "VALIDATION" | "TEST_OOS", splitTrades: BacktestTrade[]): SplitMetrics {
    const count = splitTrades.length;
    const wins = splitTrades.filter(t => t.outcome === "WIN");
    const losses = splitTrades.filter(t => t.outcome === "LOSS");
    const wr = count > 0 ? Number(((wins.length / count) * 100).toFixed(1)) : 0;
    const netDls = Number(splitTrades.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0).toFixed(2));
    const gp = wins.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0);
    const gl = Math.abs(losses.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0));
    const pf = gl > 0 ? Number((gp / gl).toFixed(2)) : gp > 0 ? 99.0 : 0;
    const expR = count > 0 ? Number((splitTrades.reduce((acc, t) => acc + safeNum(t.rOutcome), 0) / count).toFixed(3)) : 0;

    let peak = initialBalance;
    let curBal = initialBalance;
    let maxDd = 0;
    for (const t of splitTrades) {
      curBal += t.pnlDollars;
      if (curBal > peak) peak = curBal;
      const dd = peak > 0 ? ((peak - curBal) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    }

    return {
      name,
      tradeCount: count,
      winRate: wr,
      netProfitDollars: netDls,
      profitFactor: pf,
      expectancyR: expR,
      maxDrawdownPercent: Number(maxDd.toFixed(2)),
    };
  }

  const trainSplit = computeSplitMetrics("TRAIN", trades.slice(0, trainEnd));
  const valSplit = computeSplitMetrics("VALIDATION", trades.slice(trainEnd, valEnd));
  const testSplit = computeSplitMetrics("TEST_OOS", trades.slice(valEnd));

  // Risk & Overfitting Warning Flags
  const flagWarnings: string[] = [];
  if (totalTradesCount < 20) {
    flagWarnings.push("Low sample size: Fewer than 20 trades executed; statistical significance is low.");
  }
  if (maxDrawdownPercent > 15.0) {
    flagWarnings.push(`High Drawdown Alert: Maximum drawdown of ${maxDrawdownPercent}% exceeds conservative 15% threshold.`);
  }
  if (testSplit.tradeCount > 0 && trainSplit.profitFactor > 1.2 && testSplit.profitFactor < 0.8) {
    flagWarnings.push("OOS Degradation Detected: Performance degraded significantly from Training to Out-of-Sample Test period.");
  }
  if (totalIntrabarAmbiguities > totalTradesCount * 0.15) {
    flagWarnings.push(`Intrabar Ambiguity Warning: ${totalIntrabarAmbiguities} trades hit both SL and TP in the same bar; results use conservative SL assumptions.`);
  }

  // ── 10. Aggregate Overall Summary ──
  const wins = trades.filter(t => t.outcome === "WIN");
  const losses = trades.filter(t => t.outcome === "LOSS");
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = totalTradesCount > 0 ? Number(((winCount / totalTradesCount) * 100).toFixed(1)) : 0;

  const grossProfit = Number(wins.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0).toFixed(2));
  const grossLoss = Number(Math.abs(losses.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0)).toFixed(2));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.0 : 0;

  const netProfitDollars = Number((balance - initialBalance).toFixed(2));
  const netProfitPercent = initialBalance > 0 ? Number(((netProfitDollars / initialBalance) * 100).toFixed(2)) : 0;
  const netProfitPoints = Number(trades.reduce((acc, t) => acc + safeNum(t.pnlPoints), 0).toFixed(2));

  const totalR = trades.reduce((acc, t) => acc + safeNum(t.rOutcome), 0);
  const expectancyR = totalTradesCount > 0 ? Number((totalR / totalTradesCount).toFixed(3)) : 0;

  const avgWinDollars = winCount > 0 ? Number((grossProfit / winCount).toFixed(2)) : 0;
  const avgLossDollars = lossCount > 0 ? Number((grossLoss / lossCount).toFixed(2)) : 0;
  const avgWinPoints = winCount > 0 ? Number((wins.reduce((a, t) => a + t.pnlPoints, 0) / winCount).toFixed(2)) : 0;
  const avgLossPoints = lossCount > 0 ? Number((Math.abs(losses.reduce((a, t) => a + t.pnlPoints, 0)) / lossCount).toFixed(2)) : 0;
  const winLossRatio = avgLossDollars > 0 ? Number((avgWinDollars / avgLossDollars).toFixed(2)) : 0;

  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  for (const t of trades) {
    if (t.outcome === "WIN") {
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecWins) maxConsecWins = curWins;
    } else {
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecLosses) maxConsecLosses = curLosses;
    }
  }

  const returns = trades.map(t => safeNum(t.pnlDollars) / (initialBalance || 150));
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? Number(((meanReturn / stdDev) * Math.sqrt(252)).toFixed(2)) : 0;

  const avgDuration = totalTradesCount > 0
    ? Math.round(trades.reduce((acc, t) => acc + t.durationMinutes, 0) / totalTradesCount)
    : 0;

  function buildCategoryBreakdown(groupName: string, items: BacktestTrade[]): CategoryBreakdown {
    const tCount = items.length;
    const w = items.filter(t => t.outcome === "WIN");
    const l = items.filter(t => t.outcome === "LOSS");
    const wRate = tCount > 0 ? Number(((w.length / tCount) * 100).toFixed(1)) : 0;
    const netPts = Number(items.reduce((acc, t) => acc + safeNum(t.pnlPoints), 0).toFixed(2));
    const netDls = Number(items.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0).toFixed(2));
    const gp = w.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0);
    const gl = Math.abs(l.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0));
    const pf = gl > 0 ? Number((gp / gl).toFixed(2)) : gp > 0 ? 99.0 : 0;
    const expR = tCount > 0 ? Number((items.reduce((acc, t) => acc + safeNum(t.rOutcome), 0) / tCount).toFixed(3)) : 0;

    return {
      name: groupName,
      totalTrades: tCount,
      wins: w.length,
      losses: l.length,
      winRate: wRate,
      netPnlPoints: netPts,
      netPnlDollars: netDls,
      profitFactor: pf,
      expectancyR: expR,
    };
  }

  const sessionGroups = ["London", "New York", "London/NY Overlap", "Asian", "Off-hours"] as const;
  const breakdownBySession = sessionGroups
    .map(s => buildCategoryBreakdown(s, trades.filter(t => t.session === s)))
    .filter(b => b.totalTrades > 0);

  const uniquePatterns = Array.from(new Set(trades.map(t => t.pattern)));
  const breakdownByPattern = uniquePatterns
    .map(p => buildCategoryBreakdown(p, trades.filter(t => t.pattern === p)))
    .sort((a, b) => b.totalTrades - a.totalTrades);

  const breakdownByRegime = ["TRENDING", "RANGING"]
    .map(r => buildCategoryBreakdown(r, trades.filter(t => t.regime === r)))
    .filter(b => b.totalTrades > 0);

  const breakdownByDirection = ["LONG", "SHORT"]
    .map(d => buildCategoryBreakdown(d, trades.filter(t => t.direction === d)))
    .filter(b => b.totalTrades > 0);

  // Breakdown by Contributing Strategy
  const uniqueStrategies = Array.from(new Set(trades.map(t => t.strategyName || strategyName)));
  const breakdownByStrategy = uniqueStrategies.map(stName => {
    const stratTrades = trades.filter(t => (t.strategyName || strategyName) === stName);
    return buildCategoryBreakdown(stName, stratTrades);
  });

  // Monthly Breakdown
  const monthsMap = new Map<string, BacktestTrade[]>();
  for (const tr of trades) {
    const monthKey = tr.entryTime.slice(0, 7);
    if (!monthsMap.has(monthKey)) monthsMap.set(monthKey, []);
    monthsMap.get(monthKey)!.push(tr);
  }
  const monthlyBreakdown: MonthlyBreakdown[] = Array.from(monthsMap.entries()).map(([month, mTrades]) => {
    const w = mTrades.filter(t => t.outcome === "WIN");
    const l = mTrades.filter(t => t.outcome === "LOSS");
    const gp = Number(w.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0).toFixed(2));
    const gl = Number(Math.abs(l.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0)).toFixed(2));
    const pf = gl > 0 ? Number((gp / gl).toFixed(2)) : gp > 0 ? 99.0 : 0;
    const net = Number(mTrades.reduce((acc, t) => acc + safeNum(t.pnlDollars), 0).toFixed(2));
    const wr = mTrades.length > 0 ? Number(((w.length / mTrades.length) * 100).toFixed(1)) : 0;
    return {
      month,
      totalTrades: mTrades.length,
      wins: w.length,
      losses: l.length,
      winRate: wr,
      netPnlDollars: net,
      grossProfit: gp,
      grossLoss: gl,
      profitFactor: pf,
    };
  }).sort((a, b) => a.month.localeCompare(b.month));

  const runId = `RUN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const runTimestamp = new Date().toISOString();

  let totalRequiredMargin = 0;
  let maxMarginUsagePercent = 0;
  for (const t of trades) {
    if (t.requiredMargin) totalRequiredMargin += t.requiredMargin;
    if (t.marginUsagePercent && t.marginUsagePercent > maxMarginUsagePercent) {
      maxMarginUsagePercent = t.marginUsagePercent;
    }
  }
  const avgRequiredMargin = trades.length > 0 ? Number((totalRequiredMargin / trades.length).toFixed(2)) : 0;
  const effectiveLotSize = lotSizeMode === "FIXED"
    ? customLotSize
    : (trades.length > 0 ? Number((trades.reduce((a, t) => a + (t.lotSize || 0.01), 0) / trades.length).toFixed(2)) : 0.01);

  const finalResult: BacktestResult = {
    runId,
    runTimestamp,
    summary: {
      totalTrades: totalTradesCount,
      winningTrades: winCount,
      losingTrades: lossCount,
      winRate,
      initialBalance,
      finalBalance: balance,
      netProfitDollars,
      netProfitPercent,
      netProfitPoints,
      grossProfit,
      grossLoss,
      profitFactor,
      expectancyR,
      maxDrawdownDollars,
      maxDrawdownPercent,
      averageWinDollars: avgWinDollars,
      averageLossDollars: avgLossDollars,
      averageWinPoints: avgWinPoints,
      averageLossPoints: avgLossPoints,
      winLossRatio,
      sharpeRatio,
      maxConsecutiveWins: maxConsecWins,
      maxConsecutiveLosses: maxConsecLosses,
      avgTradeDurationMinutes: avgDuration,
      candlesEvaluated: candles.length,
      timeframe: tf,
      dataSource: "MetaApi Historical Cloud Feed (Persisted)",
      runnerTradesCount,
      intrabarAmbiguitiesCount: totalIntrabarAmbiguities,
      strategyMode,
      strategyName,
      lotSize: effectiveLotSize,
      lotSizeMode,
      leverage,
      avgRequiredMargin,
      maxMarginUsagePercent: Number(maxMarginUsagePercent.toFixed(2)),
      pointValueDollars: Number((effectiveLotSize * contractSize).toFixed(2)),
      totalEligibleSignals,
      totalRejectedSignals,
      rejectionsByFilter,
      availableCandleCount: candles.length,
      earliestCandleUTC: toDate(candles[0].time).toISOString(),
      latestCandleUTC: toDate(candles[candles.length - 1].time).toISOString(),
      dataCompleteness: candles.length >= 300 ? "COMPLETE" : "PARTIAL",
      missingCandlesCount: 0,
    },
    breakdownBySession,
    breakdownByPattern,
    breakdownByRegime,
    breakdownByDirection,
    breakdownByStrategy,
    monthlyBreakdown,
    variantComparison,
    ablationMatrix,
    oosValidation: {
      train: trainSplit,
      validation: valSplit,
      test: testSplit,
      flagWarnings,
    },
    equityCurve,
    trades: trades.slice(-300),
    evaluationLogs: evaluationLogs.slice(-150),
    testedParams: params,
    executionCostModel: {
      symbol,
      contractSize,
      pointValueDollars: 100.0,
      spreadPoints: spread,
      spreadDollarsPerLot: Number((spread * contractSize).toFixed(2)),
      slippagePoints: slippage,
      slippageDollarsPerLot: Number((slippage * contractSize).toFixed(2)),
      commissionPerLot,
      totalRoundTripCostPerLot: Number(((spread + slippage) * contractSize + commissionPerLot * 2).toFixed(2)),
      explanation: `Institutional MT5 standard XAUUSD contract: 1 lot = ${contractSize} troy oz. 1 point move ($1.00/oz) = $100.00/lot. Spread (${spread} pts) incurs $${(spread * contractSize).toFixed(2)}/lot round-trip. Entry adds slippage ($${(slippage * contractSize).toFixed(2)}/lot).`,
    },
  };

  // ── 10. Persist immutable run snapshot to disk ──
  try {
    ensureRunsDir();
    const runFilePath = path.resolve(RUNS_DIR, `${runId}.json`);
    fs.writeFileSync(runFilePath, JSON.stringify(finalResult, null, 2), "utf8");
    logger.info({ runId }, "[Backtest] Immutable backtest run snapshot persisted to disk");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[Backtest] Failed to write run snapshot");
  }

  return finalResult;
}

/**
 * Returns summary list of past immutable backtest runs
 */
export function getPastBacktestRuns(): Array<{
  runId: string;
  runTimestamp: string;
  timeframe: string;
  totalTrades: number;
  winRate: number;
  netProfitDollars: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  variant: string;
}> {
  ensureRunsDir();
  try {
    const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith(".json"));
    const summaries: any[] = [];
    for (const f of files.slice(-25)) {
      try {
        const raw = fs.readFileSync(path.resolve(RUNS_DIR, f), "utf8");
        const parsed = JSON.parse(raw);
        summaries.push({
          runId: parsed.runId,
          runTimestamp: parsed.runTimestamp,
          timeframe: parsed.summary?.timeframe || "5m",
          totalTrades: parsed.summary?.totalTrades || 0,
          winRate: parsed.summary?.winRate || 0,
          netProfitDollars: parsed.summary?.netProfitDollars || 0,
          profitFactor: parsed.summary?.profitFactor || 0,
          maxDrawdownPercent: parsed.summary?.maxDrawdownPercent || 0,
          variant: parsed.testedParams?.trailingStopVariant || "ASYMMETRIC_RUNNER",
        });
      } catch {}
    }
    return summaries.sort((a, b) => b.runTimestamp.localeCompare(a.runTimestamp));
  } catch {
    return [];
  }
}
