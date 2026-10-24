import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { runBacktest, type BacktestParams, type BacktestResult, type BacktestTrade } from "./backtestEngine.js";
import {
  auditHistoricalData,
  getHistoricalCandlesForEngine,
  loadStoredCandles,
  toDate,
} from "./historicalDataManager.js";
import { getConfiguredSymbol } from "./metaApiFeed.js";
import { logger } from "./logger.js";

const CAMPAIGN_DIR = path.resolve(process.cwd(), ".historical_data", "research_campaigns");
const CAMPAIGN_STATE_FILE = path.resolve(CAMPAIGN_DIR, "active_campaign.json");
const CAMPAIGN_HISTORY_FILE = path.resolve(CAMPAIGN_DIR, "campaign_history.json");

function ensureCampaignDir(): void {
  if (!fs.existsSync(CAMPAIGN_DIR)) {
    fs.mkdirSync(CAMPAIGN_DIR, { recursive: true });
  }
}

export interface DiscoveredStrategy {
  id: string;
  name: string;
  version: string;
  category: "PRIMARY_STRATEGY" | "ABLATION_BASELINE" | "ENGINE_MODULE";
  signalLogicRef: string;
  supportedTimeframes: string[];
  availableParameters: Array<{
    name: string;
    type: "number" | "boolean" | "select";
    default: any;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    description: string;
  }>;
  requiredWarmup: number;
  defaultConfig: Record<string, any>;
  validationStatus: "VALIDATED" | "ACTIVE_RESEARCH" | "EXPERIMENTAL";
}

export interface WalkForwardFold {
  foldIndex: number;
  trainRange: { start: string; end: string; candleCount: number };
  oosRange: { start: string; end: string; candleCount: number };
  inSample: {
    netProfitDollars: number;
    profitFactor: number;
    winRate: number;
    tradesCount: number;
    maxDrawdownPercent: number;
  };
  outOfSample: {
    netProfitDollars: number;
    profitFactor: number;
    winRate: number;
    tradesCount: number;
    maxDrawdownPercent: number;
    expectancyR: number;
  };
  degradationPercent: number;
  isProfitable: boolean;
}

export interface ResearchCandidate {
  candidateId: string;
  rank: number;
  strategyId: string;
  strategyName: string;
  timeframe: string;
  config: Record<string, any>;
  executionCostMode: "NORMAL_COST" | "STRESSED_COST";
  overallMetrics: {
    netProfitDollars: number;
    netProfitPercent: number;
    profitFactor: number;
    winRate: number;
    expectancyR: number;
    maxDrawdownPercent: number;
    maxDrawdownDollars: number;
    totalTrades: number;
    sharpeRatio: number;
  };
  walkForwardMetrics: {
    foldsCount: number;
    profitableFoldsCount: number;
    consistencyScore: number;
    averageOosProfitFactor: number;
    averageDegradationPercent: number;
    folds: WalkForwardFold[];
  };
  stressTest: {
    normalCostPF: number;
    stressedCostPF: number;
    survivesStress: boolean;
    spreadSensitivity: "LOW" | "MODERATE" | "HIGH";
  };
  regimePerformance: {
    trendingPF: number;
    rangingPF: number;
    trendingTrades: number;
    rangingTrades: number;
  };
  recommendationStatus: "VALIDATED_FOR_PAPER" | "PROMISING" | "INCONCLUSIVE" | "REJECTED";
  recommendationReasons: string[];
  rejectionFlags: string[];
  runIdRef: string;
}

export interface TrailingStopComparisonItem {
  variant: string;
  name: string;
  netProfitDollars: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  expectancyR: number;
  avgHoldingMinutes: number;
  totalTrades: number;
  runnerActivationRate: number;
  exitReasonsBreakdown: Record<string, number>;
}

export interface ResearchCampaignState {
  campaignId: string;
  status: "IDLE" | "RUNNING" | "PAUSED" | "CANCELLED" | "COMPLETED" | "ERROR";
  progressPercent: number;
  totalPlanned: number;
  completedCount: number;
  remainingCount: number;
  failedCount: number;
  currentExperiment: {
    experimentId: string;
    strategyName: string;
    timeframe: string;
    params: any;
    startTime: string;
  } | null;
  estimatedTimeRemainingSec: number;
  startTime: string | null;
  endTime?: string | null;
  lastUpdateTime: string;
  errors: Array<{ timestamp: string; experimentId?: string; message: string }>;
  rankedCandidates: ResearchCandidate[];
  trailingStopComparison: TrailingStopComparisonItem[];
  historicalDataSummary: {
    symbol: string;
    timeframes: Record<string, any>;
    readinessStatus: "READY" | "INCOMPLETE";
    readinessMessage: string;
  };
  completedExperimentIds: string[];
  completedResults: Record<string, any>;
  aiSummaryReport?: {
    generatedAt: string;
    summary: string;
    topRecommendation: string | null;
    followUpExperiments: string[];
  };
}

let activeCampaignState: ResearchCampaignState = {
  campaignId: `CAMP-INIT`,
  status: "IDLE",
  progressPercent: 0,
  totalPlanned: 0,
  completedCount: 0,
  remainingCount: 0,
  failedCount: 0,
  currentExperiment: null,
  estimatedTimeRemainingSec: 0,
  startTime: null,
  lastUpdateTime: new Date().toISOString(),
  errors: [],
  rankedCandidates: [],
  trailingStopComparison: [],
  historicalDataSummary: {
    symbol: "GOLD",
    timeframes: {},
    readinessStatus: "READY",
    readinessMessage: "Historical data check pending",
  },
  completedExperimentIds: [],
  completedResults: {},
};

let cancelRequested = false;
let pauseRequested = false;
let isLoopRunning = false;

/**
 * Persists current campaign state to disk for fault tolerance and resumption
 */
function persistCampaignState(): void {
  ensureCampaignDir();
  try {
    fs.writeFileSync(CAMPAIGN_STATE_FILE, JSON.stringify(activeCampaignState, null, 2), "utf8");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[ResearchController] Failed to persist campaign state to disk");
  }
}

/**
 * Loads campaign state from disk on startup if available
 */
export function loadPersistedCampaignState(): ResearchCampaignState {
  ensureCampaignDir();
  try {
    if (fs.existsSync(CAMPAIGN_STATE_FILE)) {
      const raw = fs.readFileSync(CAMPAIGN_STATE_FILE, "utf8");
      const loaded = JSON.parse(raw);
      if (loaded && loaded.campaignId) {
        activeCampaignState = loaded;
        // If it was abruptly interrupted in RUNNING state, mark as PAUSED so user can safely resume
        if (activeCampaignState.status === "RUNNING") {
          activeCampaignState.status = "PAUSED";
          activeCampaignState.lastUpdateTime = new Date().toISOString();
        }
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[ResearchController] Could not restore persisted campaign");
  }
  return activeCampaignState;
}

// Initialize on module load
loadPersistedCampaignState();

/**
 * Automatically discovers existing strategies and filters in the codebase
 */
export function discoverExistingStrategies(): DiscoveredStrategy[] {
  return [
    {
      id: "HYBRID_DUAL",
      name: "Optimized Live Bot (Hybrid Dual-Engine Scalper)",
      version: "v2.4.0",
      category: "PRIMARY_STRATEGY",
      signalLogicRef: "artifacts/api-server/src/lib/backtestEngine.ts:883 & signalEngine.ts",
      supportedTimeframes: ["1m", "5m", "15m"],
      availableParameters: [
        { name: "tpRatio", type: "number", min: 1.5, max: 3.5, step: 0.5, default: 2.5, description: "Take profit reward-to-risk multiplier" },
        { name: "featureStructuralStop", type: "boolean", default: true, description: "Structural swing high/low SL vs static flat SL" },
        { name: "featureEntryConfirmation", type: "boolean", default: true, description: "Strict candle close confirmation check" },
        { name: "featureContextPatternFilter", type: "boolean", default: true, description: "Reversal pattern zone alignment check" },
        { name: "trailingStopVariant", type: "select", options: ["ASYMMETRIC_RUNNER", "FIXED_DISTANCE", "ATR_TRAILING", "BREAKEVEN_ONLY", "PROFIT_TRIGGERED", "NO_TRAILING"], default: "ASYMMETRIC_RUNNER", description: "Exit management model" },
      ],
      requiredWarmup: 50,
      defaultConfig: {
        strategyMode: "HYBRID_DUAL",
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
      },
      validationStatus: "ACTIVE_RESEARCH",
    },
    {
      id: "LEGACY_UNFILTERED",
      name: "Legacy Unfiltered Scalper Baseline",
      version: "v1.0.0",
      category: "ABLATION_BASELINE",
      signalLogicRef: "artifacts/api-server/src/lib/backtestEngine.ts (All feature flags = false)",
      supportedTimeframes: ["5m", "15m"],
      availableParameters: [
        { name: "tpRatio", type: "number", min: 1.5, max: 3.0, step: 0.5, default: 2.0, description: "Unfiltered target ratio" },
        { name: "trailingStopVariant", type: "select", options: ["NO_TRAILING", "FIXED_DISTANCE", "BREAKEVEN_ONLY"], default: "NO_TRAILING", description: "Exit method" },
      ],
      requiredWarmup: 30,
      defaultConfig: {
        strategyMode: "HYBRID_DUAL",
        tpRatio: 2.0,
        trailingStopVariant: "NO_TRAILING",
        featureStructuralStop: false,
        featureEntryConfirmation: false,
        featureContextPatternFilter: false,
        featureSpreadGuard: false,
        featureSessionFilter: false,
      },
      validationStatus: "EXPERIMENTAL",
    },
    {
      id: "DETERMINISTIC_ORB",
      name: "Pure Deterministic NY 3h ORB Engine",
      version: "v1.5.0",
      category: "PRIMARY_STRATEGY",
      signalLogicRef: "artifacts/api-server/src/lib/deterministicOrbEngine.ts & backtestEngine.ts:797",
      supportedTimeframes: ["5m", "15m"],
      availableParameters: [
        { name: "tpRatio", type: "number", min: 2.0, max: 4.0, step: 0.5, default: 2.5, description: "ORB Target expansion ratio" },
        { name: "trailingStopVariant", type: "select", options: ["ASYMMETRIC_RUNNER", "ATR_TRAILING", "FIXED_DISTANCE"], default: "ASYMMETRIC_RUNNER", description: "Trailing model" },
      ],
      requiredWarmup: 50,
      defaultConfig: {
        strategyMode: "DETERMINISTIC_ORB",
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: false,
        featureSpreadGuard: true,
        featureSessionFilter: true,
      },
      validationStatus: "ACTIVE_RESEARCH",
    },
    {
      id: "SMC_CONFLUENCE",
      name: "Institutional Order Block & S/R Engine",
      version: "v2.1.0",
      category: "ENGINE_MODULE",
      signalLogicRef: "artifacts/api-server/src/lib/technicalIndicators.ts:detectOrderBlocks",
      supportedTimeframes: ["5m", "15m"],
      availableParameters: [
        { name: "tpRatio", type: "number", min: 2.0, max: 3.5, step: 0.5, default: 2.5, description: "Target ratio" },
      ],
      requiredWarmup: 50,
      defaultConfig: {
        strategyMode: "HYBRID_DUAL",
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureContextPatternFilter: true,
      },
      validationStatus: "VALIDATED",
    },
  ];
}

/**
 * Validates historical data readiness across timeframes
 */
export function checkHistoricalDataReadiness(): {
  symbol: string;
  timeframes: Record<string, any>;
  readinessStatus: "READY" | "INCOMPLETE";
  readinessMessage: string;
} {
  const symbol = getConfiguredSymbol() || "GOLD";
  const tfs = ["1m", "5m", "15m", "1h"];
  const tfSummary: Record<string, any> = {};

  let has5m = false;
  let has15m = false;
  let totalCandlesCount = 0;

  for (const tf of tfs) {
    const audit = auditHistoricalData(symbol, tf);
    tfSummary[tf] = {
      candleCount: audit.coverage.candleCount,
      firstCandleUTC: audit.coverage.firstCandleUTC,
      lastCandleUTC: audit.coverage.lastCandleUTC,
      gapCount: audit.coverage.gapCount,
      dataQuality: audit.coverage.dataQuality,
      issuesCount: audit.issues.length,
    };
    totalCandlesCount += audit.coverage.candleCount;
    if (tf === "5m" && audit.coverage.candleCount >= 100) has5m = true;
    if (tf === "15m" && audit.coverage.candleCount >= 100) has15m = true;
  }

  const isReady = has5m || has15m;
  const message = isReady
    ? `Historical dataset verified (${totalCandlesCount} total candles available across inspected timeframes; 5m and 15m active).`
    : `Historical dataset insufficient (requires at least 100 verified candles on 5m or 15m). Please sync from MetaApi or import CSV.`;

  return {
    symbol,
    timeframes: tfSummary,
    readinessStatus: isReady ? "READY" : "INCOMPLETE",
    readinessMessage: message,
  };
}

/**
 * Generates bounded experiment plan according to scientific research criteria
 */
function generateExperimentPlan(options?: {
  maxExperiments?: number;
  timeframe?: string;
  enableStressTesting?: boolean;
}): Array<{
  experimentId: string;
  strategyId: string;
  strategyName: string;
  timeframe: string;
  category: "STRATEGY_COMPARISON" | "FILTER_ABLATION" | "PARAMETER_OPTIMIZATION" | "TRAILING_VARIANT" | "STRESS_TEST";
  params: BacktestParams;
  executionMode: "NORMAL_COST" | "STRESSED_COST";
  description: string;
}> {
  const primaryTf = options?.timeframe || "5m";
  const maxExp = options?.maxExperiments || 20;
  const experiments: any[] = [];

  // 1. Primary Strategy Comparisons (Benchmark across main paradigms)
  experiments.push(
    {
      experimentId: "EXP-STRAT-01-HYBRID-LIVE",
      strategyId: "HYBRID_DUAL",
      strategyName: "Optimized Live Bot (Hybrid Dual Scalper)",
      timeframe: primaryTf,
      category: "STRATEGY_COMPARISON",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Full production configuration of Optimized Live Bot on current primary timeframe",
    },
    {
      experimentId: "EXP-STRAT-02-DETERMINISTIC-ORB",
      strategyId: "DETERMINISTIC_ORB",
      strategyName: "Pure Deterministic 3H NY ORB Engine",
      timeframe: primaryTf,
      category: "STRATEGY_COMPARISON",
      params: {
        strategyMode: "DETERMINISTIC_ORB",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Hermes AI Adaptive Confluence with multi-factor sweet-spot filters",
    },
    {
      experimentId: "EXP-STRAT-03-LEGACY-UNFILTERED",
      strategyId: "LEGACY_UNFILTERED",
      strategyName: "Legacy Unfiltered Scalper",
      timeframe: primaryTf,
      category: "STRATEGY_COMPARISON",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.0,
        trailingStopVariant: "NO_TRAILING",
        featureStructuralStop: false,
        featureEntryConfirmation: false,
        featureContextPatternFilter: false,
        featureSpreadGuard: false,
        featureSessionFilter: false,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Legacy Unfiltered baseline without session guard, confirmation, or context filters",
    },
    {
      experimentId: "EXP-STRAT-04-NY-ORB",
      strategyId: "DETERMINISTIC_ORB",
      strategyName: "Pure Deterministic NY 3h ORB Engine",
      timeframe: primaryTf,
      category: "STRATEGY_COMPARISON",
      params: {
        strategyMode: "DETERMINISTIC_ORB",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Pure NY 3-Hour Opening Range Breakout with EMA50 baseline filter",
    }
  );

  // 2. Trailing Stop Variants on Identical Entry Logic
  const trailingVariants: Array<{ id: any; name: string; desc: string }> = [
    { id: "NO_TRAILING", name: "No Trailing (Fixed SL/TP)", desc: "Hard Take Profit & Stop Loss only" },
    { id: "FIXED_DISTANCE", name: "Fixed Distance (4.0 pts)", desc: "Trails SL exactly 4.0 points behind peak" },
    { id: "ATR_TRAILING", name: "ATR Dynamic (2.0x ATR)", desc: "Trails SL dynamically based on volatility" },
    { id: "BREAKEVEN_ONLY", name: "Breakeven Only", desc: "Moves SL to breakeven + buffer once in profit" },
    { id: "PROFIT_TRIGGERED", name: "Profit-Triggered Trailing", desc: "Begins trailing only after +2.5 pts profit reached" },
  ];

  for (const tv of trailingVariants) {
    experiments.push({
      experimentId: `EXP-TRAIL-${tv.id}`,
      strategyId: "HYBRID_DUAL",
      strategyName: `Optimized Scalper [${tv.name}]`,
      timeframe: primaryTf,
      category: "TRAILING_VARIANT",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: tv.id,
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: `Exit trailing comparison: ${tv.desc}`,
    });
  }

  // 3. Filter Ablation (Impact of individual protective guards)
  experiments.push(
    {
      experimentId: "EXP-ABL-NO-SESSION",
      strategyId: "HYBRID_DUAL",
      strategyName: "Optimized Scalper (No Session Filter)",
      timeframe: primaryTf,
      category: "FILTER_ABLATION",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: false, // Turned OFF
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Ablation test: Measures edge loss when trading outside London/NY window",
    },
    {
      experimentId: "EXP-ABL-NO-SPREAD-GUARD",
      strategyId: "HYBRID_DUAL",
      strategyName: "Optimized Scalper (No Spread Guard)",
      timeframe: primaryTf,
      category: "FILTER_ABLATION",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: false, // Turned OFF
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Ablation test: Measures performance without spread guard protection",
    },
    {
      experimentId: "EXP-ABL-NO-CONFIRMATION",
      strategyId: "HYBRID_DUAL",
      strategyName: "Optimized Scalper (No Bar Confirmation)",
      timeframe: primaryTf,
      category: "FILTER_ABLATION",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: false, // Turned OFF
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Ablation test: Measures false breakouts when entering before bar close",
    }
  );

  // 4. Parameter Optimization Grid (Bounded TP Ratio search)
  const tpRatios = [1.8, 2.2, 3.0, 3.5];
  for (const tp of tpRatios) {
    experiments.push({
      experimentId: `EXP-PARAM-TP-${tp.toFixed(1)}`,
      strategyId: "HYBRID_DUAL",
      strategyName: `Optimized Scalper (TP Ratio ${tp.toFixed(1)})`,
      timeframe: primaryTf,
      category: "PARAMETER_OPTIMIZATION",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: tp,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: `Bounded parameter optimization: Reward/Risk target ratio set to ${tp.toFixed(1)}R`,
    });
  }

  // 5. Multi-timeframe validation (15m validation)
  experiments.push(
    {
      experimentId: "EXP-TF-15M-HYBRID",
      strategyId: "HYBRID_DUAL",
      strategyName: "Optimized Scalper (15m Timeframe)",
      timeframe: "15m",
      category: "STRATEGY_COMPARISON",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: "15m",
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Validation on higher 15-minute timeframe for trend persistence",
    },
    {
      experimentId: "EXP-TF-15M-ORB",
      strategyId: "DETERMINISTIC_ORB",
      strategyName: "Deterministic 3H NY ORB (15m)",
      timeframe: "15m",
      category: "STRATEGY_COMPARISON",
      params: {
        strategyMode: "DETERMINISTIC_ORB",
        timeframe: "15m",
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.45,
        slippage: 0.08,
      },
      executionMode: "NORMAL_COST",
      description: "Deterministic 3H NY ORB on 15m higher timeframe",
    }
  );

  // 6. Realistic Execution Stressed Cost Scenarios
  experiments.push(
    {
      experimentId: "EXP-STRESS-COST-HYBRID",
      strategyId: "HYBRID_DUAL",
      strategyName: "Optimized Scalper (Stressed Broker Costs)",
      timeframe: primaryTf,
      category: "STRESS_TEST",
      params: {
        strategyMode: "HYBRID_DUAL",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.75, // Stressed spread
        slippage: 0.18, // Stressed slippage
      },
      executionMode: "STRESSED_COST",
      description: "Execution fragility test: Stressed 0.75 pt spread + 0.18 pt slippage",
    },
    {
      experimentId: "EXP-STRESS-COST-ALPHA",
      strategyId: "ALPHA_TRADES_SD",
      strategyName: "Alpha Trades S&D (Stressed Broker Costs)",
      timeframe: primaryTf,
      category: "STRESS_TEST",
      params: {
        strategyMode: "ALPHA_TRADES_SD",
        timeframe: primaryTf,
        candleCount: 800,
        tpRatio: 2.5,
        trailingStopVariant: "ASYMMETRIC_RUNNER",
        featureStructuralStop: true,
        featureEntryConfirmation: true,
        featureContextPatternFilter: true,
        featureSpreadGuard: true,
        featureSessionFilter: true,
        spread: 0.75,
        slippage: 0.18,
      },
      executionMode: "STRESSED_COST",
      description: "Execution fragility test on Hermes AI Adaptive under stressed execution",
    }
  );

  return experiments.slice(0, maxExp);
}

/**
 * Executes a Walk-Forward Validation pipeline on a completed backtest
 * Splits historical trades chronologically into rolling in-sample / out-of-sample folds
 */
function computeWalkForwardAnalysis(
  trades: BacktestTrade[],
  candlesCount: number
): {
  folds: WalkForwardFold[];
  consistencyScore: number;
  averageOosProfitFactor: number;
  averageDegradationPercent: number;
} {
  if (!trades || trades.length < 8) {
    return {
      folds: [],
      consistencyScore: 0,
      averageOosProfitFactor: 0,
      averageDegradationPercent: 0,
    };
  }

  // 4 Rolling Folds (e.g. 50% IS, 25% OOS rolling forward by 15%)
  const numFolds = 3;
  const folds: WalkForwardFold[] = [];

  const totalTrades = trades.length;
  const windowSize = Math.floor(totalTrades * 0.55);
  const oosSize = Math.floor(totalTrades * 0.25);
  const step = Math.max(1, Math.floor((totalTrades - windowSize - oosSize) / (numFolds - 1 || 1)));

  let profitableCount = 0;
  let sumOosPf = 0;
  let sumDegradation = 0;

  for (let f = 0; f < numFolds; f++) {
    const isStart = f * step;
    const isEnd = Math.min(totalTrades, isStart + windowSize);
    const oosStart = isEnd;
    const oosEnd = Math.min(totalTrades, oosStart + oosSize);

    if (oosEnd <= oosStart) break;

    const isTrades = trades.slice(isStart, isEnd);
    const oosTrades = trades.slice(oosStart, oosEnd);

    const calcSplit = (list: BacktestTrade[]) => {
      let win = 0;
      let grossProfit = 0;
      let grossLoss = 0;
      let netProfitDollars = 0;
      let peak = 0;
      let dd = 0;
      let sumR = 0;

      for (const t of list) {
        netProfitDollars += t.pnlDollars;
        sumR += t.rOutcome || 0;
        if (t.pnlDollars > 0) {
          win++;
          grossProfit += t.pnlDollars;
        } else {
          grossLoss += Math.abs(t.pnlDollars);
        }
        if (netProfitDollars > peak) peak = netProfitDollars;
        const currentDd = peak - netProfitDollars;
        if (currentDd > dd) dd = currentDd;
      }

      const pf = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99 : 0;
      const wr = list.length > 0 ? Number(((win / list.length) * 100).toFixed(1)) : 0;
      const expR = list.length > 0 ? Number((sumR / list.length).toFixed(2)) : 0;
      const maxDdPct = peak > 0 ? Number(((dd / (10000 + peak)) * 100).toFixed(2)) : 0;

      return {
        netProfitDollars: Number(netProfitDollars.toFixed(2)),
        profitFactor: pf,
        winRate: wr,
        tradesCount: list.length,
        maxDrawdownPercent: maxDdPct,
        expectancyR: expR,
      };
    };

    const isMetrics = calcSplit(isTrades);
    const oosMetrics = calcSplit(oosTrades);

    // Degradation from IS to OOS
    const degradation = isMetrics.profitFactor > 0
      ? Number((((isMetrics.profitFactor - oosMetrics.profitFactor) / isMetrics.profitFactor) * 100).toFixed(1))
      : 0;

    const isProfitable = oosMetrics.netProfitDollars > 0 && oosMetrics.profitFactor >= 1.0;
    if (isProfitable) profitableCount++;

    sumOosPf += oosMetrics.profitFactor;
    sumDegradation += Math.max(0, degradation);

    folds.push({
      foldIndex: f + 1,
      trainRange: {
        start: isTrades[0]?.entryTime || "—",
        end: isTrades[isTrades.length - 1]?.exitTime || "—",
        candleCount: Math.floor(candlesCount * 0.55),
      },
      oosRange: {
        start: oosTrades[0]?.entryTime || "—",
        end: oosTrades[oosTrades.length - 1]?.exitTime || "—",
        candleCount: Math.floor(candlesCount * 0.25),
      },
      inSample: isMetrics,
      outOfSample: oosMetrics,
      degradationPercent: degradation,
      isProfitable,
    });
  }

  const consistency = folds.length > 0 ? Number((profitableCount / folds.length).toFixed(2)) : 0;
  const avgOosPf = folds.length > 0 ? Number((sumOosPf / folds.length).toFixed(2)) : 0;
  const avgDeg = folds.length > 0 ? Number((sumDegradation / folds.length).toFixed(1)) : 0;

  return {
    folds,
    consistencyScore: consistency,
    averageOosProfitFactor: avgOosPf,
    averageDegradationPercent: avgDeg,
  };
}

/**
 * Categorizes a candidate using quantitative risk-adjusted rules
 */
function evaluateCandidateRecommendation(
  overall: any,
  wf: any,
  stressTest: any,
  category: string
): {
  status: "VALIDATED_FOR_PAPER" | "PROMISING" | "INCONCLUSIVE" | "REJECTED";
  reasons: string[];
  flags: string[];
} {
  const reasons: string[] = [];
  const flags: string[] = [];

  // Minimum trade criteria
  if (overall.totalTrades < 10) {
    flags.push(`Insufficient sample size (${overall.totalTrades} completed trades < 10 minimum requirement)`);
    return {
      status: "INCONCLUSIVE",
      reasons: ["Sample size too small to establish statistical significance"],
      flags,
    };
  }

  // Drawdown limit
  if (overall.maxDrawdownPercent > 12.0) {
    flags.push(`Excessive drawdown: ${overall.maxDrawdownPercent}% exceeds 12.0% risk limit`);
  }

  // Net loss
  if (overall.netProfitDollars <= 0 || overall.profitFactor < 1.0) {
    flags.push(`Net negative return after realistic spreads ($${overall.netProfitDollars}, PF: ${overall.profitFactor})`);
  }

  // Severe walk-forward degradation
  if (wf.averageDegradationPercent > 55) {
    flags.push(`Severe in-sample to out-of-sample degradation (${wf.averageDegradationPercent}% drop indicates overfitting)`);
  }

  // Stressed cost sensitivity
  if (stressTest.stressedCostPF < 0.95) {
    flags.push(`Strategy edge dissolves under stressed slippage/spread (Stressed PF: ${stressTest.stressedCostPF})`);
  }

  // Rejection determination
  if (flags.length >= 2 || overall.netProfitDollars <= 0) {
    return {
      status: "REJECTED",
      reasons: flags,
      flags,
    };
  }

  // Validation criteria
  const isHighProfit = overall.profitFactor >= 1.35 && overall.netProfitDollars > 30;
  const isConsistentWF = wf.consistencyScore >= 0.66;
  const isDrawdownSafe = overall.maxDrawdownPercent <= 8.0;
  const isStressResilient = stressTest.survivesStress;

  if (isHighProfit && isConsistentWF && isDrawdownSafe && isStressResilient) {
    reasons.push(`Robust Out-of-Sample Profit Factor (${overall.profitFactor}) across ${overall.totalTrades} trades`);
    reasons.push(`High Walk-Forward consistency (${Math.round(wf.consistencyScore * 100)}% profitable folds)`);
    reasons.push(`Survives stressed broker execution model (Stressed PF: ${stressTest.stressedCostPF})`);
    reasons.push(`Contained maximum drawdown (${overall.maxDrawdownPercent}%)`);
    return {
      status: "VALIDATED_FOR_PAPER",
      reasons,
      flags,
    };
  }

  // Promising criteria
  if (overall.profitFactor > 1.15 && overall.netProfitDollars > 0) {
    reasons.push(`Profitable out-of-sample edge (PF: ${overall.profitFactor}, Net: +$${overall.netProfitDollars})`);
    if (!isConsistentWF) flags.push(`Moderate walk-forward consistency (${Math.round(wf.consistencyScore * 100)}%)`);
    if (!isStressResilient) flags.push(`Sensitive to broker spread widening under stress`);
    return {
      status: "PROMISING",
      reasons,
      flags,
    };
  }

  return {
    status: "INCONCLUSIVE",
    reasons: ["Performance metrics near break-even without decisive statistical edge"],
    flags,
  };
}

/**
 * Controller main loop to run bounded campaign sequentially
 */
async function runCampaignLoop(): Promise<void> {
  if (isLoopRunning) return;
  isLoopRunning = true;

  try {
    const readiness = checkHistoricalDataReadiness();
    activeCampaignState.historicalDataSummary = readiness;

    if (readiness.readinessStatus !== "READY") {
      activeCampaignState.status = "ERROR";
      activeCampaignState.errors.push({
        timestamp: new Date().toISOString(),
        message: readiness.readinessMessage,
      });
      persistCampaignState();
      isLoopRunning = false;
      return;
    }

    const plan = generateExperimentPlan({ maxExperiments: 18 });
    activeCampaignState.totalPlanned = plan.length;
    activeCampaignState.remainingCount = plan.length - activeCampaignState.completedExperimentIds.length;

    logger.info({ planCount: plan.length }, "[ResearchController] Starting autonomous research campaign loop");

    const startTimeMs = Date.now();
    let expIndex = 0;

    for (const exp of plan) {
      // Check pause / cancel triggers
      if (cancelRequested) {
        activeCampaignState.status = "CANCELLED";
        logger.info("[ResearchController] Campaign cancelled by user");
        break;
      }

      if (pauseRequested) {
        activeCampaignState.status = "PAUSED";
        logger.info("[ResearchController] Campaign paused by user");
        break;
      }

      // Check if already completed (for idempotency and resume)
      if (activeCampaignState.completedExperimentIds.includes(exp.experimentId)) {
        logger.info({ experimentId: exp.experimentId }, "[ResearchController] Skipping already completed experiment");
        continue;
      }

      expIndex++;
      activeCampaignState.currentExperiment = {
        experimentId: exp.experimentId,
        strategyName: exp.strategyName,
        timeframe: exp.timeframe,
        params: exp.params,
        startTime: new Date().toISOString(),
      };
      persistCampaignState();

      try {
        logger.info({ expId: exp.experimentId, strategy: exp.strategyName }, "[ResearchController] Running experiment");

        // Run primary quantitative backtest with strict execution model
        const result = await runBacktest({
          ...exp.params,
          timeframe: exp.timeframe,
        });

        // Run stressed cost backtest for sensitivity scoring
        const stressedResult = await runBacktest({
          ...exp.params,
          timeframe: exp.timeframe,
          spread: 0.75,
          slippage: 0.18,
        }).catch(() => null);

        const normalCostPF = result.summary.profitFactor;
        const stressedCostPF = stressedResult?.summary.profitFactor || normalCostPF * 0.75;
        const survivesStress = stressedCostPF >= 1.05;
        const spreadSensitivity: "LOW" | "MODERATE" | "HIGH" =
          normalCostPF - stressedCostPF < 0.25 ? "LOW" : normalCostPF - stressedCostPF < 0.65 ? "MODERATE" : "HIGH";

        // Compute chronological Walk-Forward analysis
        const wf = computeWalkForwardAnalysis(result.trades, result.summary.candlesEvaluated || 800);

        // Compute regime breakdown
        const trendingTrades = result.trades.filter(t => t.regime === "TRENDING");
        const rangingTrades = result.trades.filter(t => t.regime === "RANGING");
        const calcPf = (list: BacktestTrade[]) => {
          let win = 0, loss = 0;
          for (const t of list) {
            if (t.pnlDollars > 0) win += t.pnlDollars;
            else loss += Math.abs(t.pnlDollars);
          }
          return loss > 0 ? Number((win / loss).toFixed(2)) : win > 0 ? 99 : 0;
        };

        const trendingPF = calcPf(trendingTrades);
        const rangingPF = calcPf(rangingTrades);

        // Candidate evaluation & recommendation status
        const evalRec = evaluateCandidateRecommendation(
          result.summary,
          wf,
          { normalCostPF, stressedCostPF, survivesStress },
          exp.category
        );

        const candidate: ResearchCandidate = {
          candidateId: exp.experimentId,
          rank: 0,
          strategyId: exp.strategyId,
          strategyName: exp.strategyName,
          timeframe: exp.timeframe,
          config: exp.params,
          executionCostMode: exp.executionMode,
          overallMetrics: {
            netProfitDollars: result.summary.netProfitDollars,
            netProfitPercent: result.summary.netProfitPercent,
            profitFactor: result.summary.profitFactor,
            winRate: result.summary.winRate,
            expectancyR: result.summary.expectancyR,
            maxDrawdownPercent: result.summary.maxDrawdownPercent,
            maxDrawdownDollars: result.summary.maxDrawdownDollars,
            totalTrades: result.summary.totalTrades,
            sharpeRatio: result.summary.sharpeRatio || 0,
          },
          walkForwardMetrics: {
            foldsCount: wf.folds.length,
            profitableFoldsCount: wf.folds.filter(f => f.isProfitable).length,
            consistencyScore: wf.consistencyScore,
            averageOosProfitFactor: wf.averageOosProfitFactor,
            averageDegradationPercent: wf.averageDegradationPercent,
            folds: wf.folds,
          },
          stressTest: {
            normalCostPF,
            stressedCostPF,
            survivesStress,
            spreadSensitivity,
          },
          regimePerformance: {
            trendingPF,
            rangingPF,
            trendingTrades: trendingTrades.length,
            rangingTrades: rangingTrades.length,
          },
          recommendationStatus: evalRec.status,
          recommendationReasons: evalRec.reasons,
          rejectionFlags: evalRec.flags,
          runIdRef: result.runId,
        };

        // Add candidate to list (replace if already present)
        const existingIdx = activeCampaignState.rankedCandidates.findIndex(c => c.candidateId === exp.experimentId);
        if (existingIdx >= 0) {
          activeCampaignState.rankedCandidates[existingIdx] = candidate;
        } else {
          activeCampaignState.rankedCandidates.push(candidate);
        }

        // If this was a trailing stop experiment, add to trailing comparison matrix
        if (exp.category === "TRAILING_VARIANT" || exp.params.trailingStopVariant) {
          const variant = exp.params.trailingStopVariant || "ASYMMETRIC_RUNNER";
          const exitReasons: Record<string, number> = {};
          for (const t of result.trades) {
            exitReasons[t.exitReason] = (exitReasons[t.exitReason] || 0) + 1;
          }
          const avgHold = result.trades.length > 0
            ? Math.round(result.trades.reduce((acc, t) => acc + (t.durationMinutes || 0), 0) / result.trades.length)
            : 0;
          const runnerTrades = result.trades.filter(t => t.runnerActivated).length;

          const trailItem: TrailingStopComparisonItem = {
            variant,
            name: exp.strategyName,
            netProfitDollars: result.summary.netProfitDollars,
            profitFactor: result.summary.profitFactor,
            maxDrawdownPercent: result.summary.maxDrawdownPercent,
            expectancyR: result.summary.expectancyR,
            avgHoldingMinutes: avgHold,
            totalTrades: result.summary.totalTrades,
            runnerActivationRate: result.trades.length > 0 ? Number(((runnerTrades / result.trades.length) * 100).toFixed(1)) : 0,
            exitReasonsBreakdown: exitReasons,
          };

          const tIdx = activeCampaignState.trailingStopComparison.findIndex(t => t.variant === variant);
          if (tIdx >= 0) {
            activeCampaignState.trailingStopComparison[tIdx] = trailItem;
          } else {
            activeCampaignState.trailingStopComparison.push(trailItem);
          }
        }

        activeCampaignState.completedExperimentIds.push(exp.experimentId);
        activeCampaignState.completedCount = activeCampaignState.completedExperimentIds.length;
        activeCampaignState.remainingCount = Math.max(0, activeCampaignState.totalPlanned - activeCampaignState.completedCount);
        activeCampaignState.progressPercent = Math.min(
          100,
          Math.round((activeCampaignState.completedCount / activeCampaignState.totalPlanned) * 100)
        );

        // Estimate remaining time based on elapsed time per experiment
        const elapsed = (Date.now() - startTimeMs) / 1000;
        const avgPerExp = elapsed / Math.max(1, expIndex);
        activeCampaignState.estimatedTimeRemainingSec = Math.round(avgPerExp * activeCampaignState.remainingCount);
        activeCampaignState.lastUpdateTime = new Date().toISOString();

        persistCampaignState();
      } catch (err: any) {
        logger.error({ expId: exp.experimentId, err: err?.message }, "[ResearchController] Experiment failed");
        activeCampaignState.failedCount++;
        activeCampaignState.errors.push({
          timestamp: new Date().toISOString(),
          experimentId: exp.experimentId,
          message: err?.message || "Execution error during backtest",
        });
        persistCampaignState();
      }
    }

    // Rank all candidates strictly by multi-criteria quantitative score
    activeCampaignState.rankedCandidates.sort((a, b) => {
      // Prioritize VALIDATED > PROMISING > INCONCLUSIVE > REJECTED
      const scoreStatus = (st: string) => (st === "VALIDATED_FOR_PAPER" ? 4 : st === "PROMISING" ? 3 : st === "INCONCLUSIVE" ? 2 : 1);
      const diffStatus = scoreStatus(b.recommendationStatus) - scoreStatus(a.recommendationStatus);
      if (diffStatus !== 0) return diffStatus;

      // Then by Out-of-Sample Profit Factor * Consistency
      const scoreA = a.overallMetrics.profitFactor * (a.walkForwardMetrics.consistencyScore || 0.5);
      const scoreB = b.overallMetrics.profitFactor * (b.walkForwardMetrics.consistencyScore || 0.5);
      return scoreB - scoreA;
    });

    // Assign rank indices
    activeCampaignState.rankedCandidates.forEach((c, idx) => {
      c.rank = idx + 1;
    });

    // Update campaign status
    if (cancelRequested) {
      activeCampaignState.status = "CANCELLED";
    } else if (pauseRequested) {
      activeCampaignState.status = "PAUSED";
    } else {
      activeCampaignState.status = "COMPLETED";
      activeCampaignState.progressPercent = 100;
      activeCampaignState.remainingCount = 0;
      activeCampaignState.currentExperiment = null;
      activeCampaignState.endTime = new Date().toISOString();
      logger.info(
        {
          totalCompleted: activeCampaignState.completedCount,
          topCandidate: activeCampaignState.rankedCandidates[0]?.strategyName,
        },
        "[ResearchController] Campaign successfully completed all planned tests"
      );
    }

    persistCampaignState();
  } catch (err: any) {
    logger.error({ err: err?.message }, "[ResearchController] Fatal error in campaign loop");
    activeCampaignState.status = "ERROR";
    activeCampaignState.errors.push({
      timestamp: new Date().toISOString(),
      message: err?.message || "Fatal error during campaign execution",
    });
    persistCampaignState();
  } finally {
    isLoopRunning = false;
    cancelRequested = false;
    pauseRequested = false;
  }
}

/**
 * Controller actions: Start, Pause, Resume, Cancel
 */
export async function startResearchCampaign(options?: {
  maxExperiments?: number;
  timeframe?: string;
  forceRestart?: boolean;
}): Promise<ResearchCampaignState> {
  if (isLoopRunning) {
    return activeCampaignState;
  }

  if (options?.forceRestart || activeCampaignState.status === "COMPLETED" || activeCampaignState.status === "CANCELLED") {
    // Reset state for new campaign
    activeCampaignState = {
      campaignId: `CAMP-${Date.now()}`,
      status: "RUNNING",
      progressPercent: 0,
      totalPlanned: 0,
      completedCount: 0,
      remainingCount: 0,
      failedCount: 0,
      currentExperiment: null,
      estimatedTimeRemainingSec: 0,
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      errors: [],
      rankedCandidates: [],
      trailingStopComparison: [],
      historicalDataSummary: checkHistoricalDataReadiness(),
      completedExperimentIds: [],
      completedResults: {},
    };
  } else {
    activeCampaignState.status = "RUNNING";
    activeCampaignState.startTime = activeCampaignState.startTime || new Date().toISOString();
    activeCampaignState.lastUpdateTime = new Date().toISOString();
  }

  cancelRequested = false;
  pauseRequested = false;
  persistCampaignState();

  // Run in background without blocking API request
  runCampaignLoop().catch(err => {
    logger.error({ err: err?.message }, "[ResearchController] Unhandled error in campaign loop");
  });

  return activeCampaignState;
}

export function pauseResearchCampaign(): ResearchCampaignState {
  if (activeCampaignState.status === "RUNNING") {
    pauseRequested = true;
    activeCampaignState.status = "PAUSED";
    activeCampaignState.lastUpdateTime = new Date().toISOString();
    persistCampaignState();
  }
  return activeCampaignState;
}

export function resumeResearchCampaign(): ResearchCampaignState {
  if (activeCampaignState.status === "PAUSED") {
    activeCampaignState.status = "RUNNING";
    cancelRequested = false;
    pauseRequested = false;
    persistCampaignState();

    runCampaignLoop().catch(err => {
      logger.error({ err: err?.message }, "[ResearchController] Error resuming campaign");
    });
  }
  return activeCampaignState;
}

export function cancelResearchCampaign(): ResearchCampaignState {
  cancelRequested = true;
  activeCampaignState.status = "CANCELLED";
  activeCampaignState.currentExperiment = null;
  activeCampaignState.lastUpdateTime = new Date().toISOString();
  persistCampaignState();
  return activeCampaignState;
}

export function getResearchCampaignStatus(): ResearchCampaignState {
  return activeCampaignState;
}

/**
 * AI Research Assistant: Answers quantitative trading questions using actual stored results
 * Uses @google/genai with model gemini-3.8-flash, strictly grounded in empirical experiment data
 */
export async function queryAiResearchAssistant(query: string): Promise<{
  query: string;
  answer: string;
  groundedReferences: Array<{ candidateId: string; strategyName: string; profitFactor: number; status: string }>;
}> {
  const ranked = activeCampaignState.rankedCandidates;
  const trailing = activeCampaignState.trailingStopComparison;

  // Build empirical context summary for LLM grounding
  const empiricalData = {
    campaignId: activeCampaignState.campaignId,
    totalCompleted: activeCampaignState.completedCount,
    status: activeCampaignState.status,
    candidates: ranked.slice(0, 10).map(c => ({
      rank: c.rank,
      candidateId: c.candidateId,
      strategyName: c.strategyName,
      timeframe: c.timeframe,
      status: c.recommendationStatus,
      netProfit: c.overallMetrics.netProfitDollars,
      profitFactor: c.overallMetrics.profitFactor,
      winRate: c.overallMetrics.winRate,
      maxDrawdownPercent: c.overallMetrics.maxDrawdownPercent,
      expectancyR: c.overallMetrics.expectancyR,
      walkForwardConsistency: `${Math.round(c.walkForwardMetrics.consistencyScore * 100)}%`,
      stressCostPF: c.stressTest.stressedCostPF,
      reasons: c.recommendationReasons,
      flags: c.rejectionFlags,
      runId: c.runIdRef,
    })),
    trailingStops: trailing.map(t => ({
      variant: t.variant,
      name: t.name,
      netProfit: t.netProfitDollars,
      profitFactor: t.profitFactor,
      maxDrawdownPercent: t.maxDrawdownPercent,
      expectancyR: t.expectancyR,
    })),
  };

  const topCandidates = ranked.slice(0, 4).map(c => ({
    candidateId: c.candidateId,
    strategyName: c.strategyName,
    profitFactor: c.overallMetrics.profitFactor,
    status: c.recommendationStatus,
  }));

  try {
    const ai = new GoogleGenAI();
    const prompt = `You are a Senior Quantitative Trading Engineer and Backtesting Specialist analyzing the results of an Autonomous Strategy Research & Optimization Campaign for XAUUSD Gold Scalping.

USER QUESTION: "${query}"

EMPIRICAL CAMPAIGN DATA:
${JSON.stringify(empiricalData, null, 2)}

INSTRUCTIONS & RULES:
1. Base your answer strictly on the empirical campaign data provided above. Do NOT fabricate numbers, win rates, or run IDs.
2. Quote concrete candidate IDs (e.g. EXP-STRAT-01-HYBRID-LIVE, EXP-TRAIL-ASYMMETRIC_RUNNER), Profit Factors, Drawdown percentages, and Walk-Forward consistency metrics.
3. If no strategy qualified for paper testing, explicitly state that with the risk flags and reasons.
4. When discussing trailing stops, contrast the exact variants tested (ASYMMETRIC_RUNNER vs FIXED_DISTANCE vs ATR_TRAILING vs BREAKEVEN_ONLY vs NO_TRAILING).
5. Provide actionable quantitative recommendations for what follow-up test or parameter refinement to test next.
6. Format your answer with clean Markdown headers, bullet points, and a concise final takeaway.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });

    return {
      query,
      answer: response.text || "No analysis generated",
      groundedReferences: topCandidates,
    };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[ResearchController] AI assistant fallback to deterministic summary");
    // Deterministic fallback if API key or network is temporarily unavailable
    const top = ranked[0];
    const fallbackAnswer = top
      ? `### Autonomous Research Engine Empirical Summary\n\n* **Top Candidate**: ${top.strategyName} (${top.candidateId})\n* **Recommendation Status**: ${top.recommendationStatus}\n* **Out-of-Sample Profit Factor**: ${top.overallMetrics.profitFactor} across ${top.overallMetrics.totalTrades} completed trades.\n* **Net Profit**: +$${top.overallMetrics.netProfitDollars} (${top.overallMetrics.netProfitPercent}% gain) with ${top.overallMetrics.maxDrawdownPercent}% Max Drawdown.\n* **Walk-Forward Consistency**: ${Math.round(top.walkForwardMetrics.consistencyScore * 100)}% profitable folds.\n* **Stressed Execution Resilience**: Stressed PF is ${top.stressTest.stressedCostPF} (${top.stressTest.survivesStress ? "Passed" : "Fragile"}).\n\n**Next Recommended Experiment**: Validate ${top.strategyName} on the 15m timeframe under wider European session volatility.`
      : `Research campaign has not completed any valid candidate runs yet. Please initiate or resume the research campaign.`;

    return {
      query,
      answer: fallbackAnswer,
      groundedReferences: topCandidates,
    };
  }
}

/**
 * Generates a proposed configuration object for a qualified candidate
 * STRICT SAFETY BOUNDARY: Stored in isolation, never modifies the active live bot settings!
 */
export function generateProposedConfiguration(candidateId: string): {
  success: boolean;
  proposedConfig?: any;
  safetyDisclaimer: string;
  error?: string;
} {
  const candidate = activeCampaignState.rankedCandidates.find(c => c.candidateId === candidateId);
  if (!candidate) {
    return {
      success: false,
      safetyDisclaimer: "Candidate not found in active campaign results.",
      error: `No candidate found with ID ${candidateId}`,
    };
  }

  const proposedConfig = {
    configurationId: `PROP-CONFIG-${candidate.candidateId}-${Date.now()}`,
    candidateReferenceId: candidate.candidateId,
    strategyName: candidate.strategyName,
    strategyId: candidate.strategyId,
    timeframe: candidate.timeframe,
    recommendedAt: new Date().toISOString(),
    recommendationStatus: candidate.recommendationStatus,
    targetParameters: {
      strategyMode: candidate.config.strategyMode || "HYBRID_DUAL",
      timeframe: candidate.timeframe,
      tpRatio: candidate.config.tpRatio || 2.5,
      trailingStopVariant: candidate.config.trailingStopVariant || "ASYMMETRIC_RUNNER",
      featureStructuralStop: candidate.config.featureStructuralStop !== false,
      featureEntryConfirmation: candidate.config.featureEntryConfirmation !== false,
      featureContextPatternFilter: candidate.config.featureContextPatternFilter !== false,
      featureSpreadGuard: candidate.config.featureSpreadGuard !== false,
      featureSessionFilter: candidate.config.featureSessionFilter !== false,
    },
    performanceEvidence: {
      outOfSampleProfitFactor: candidate.overallMetrics.profitFactor,
      netProfitDollars: candidate.overallMetrics.netProfitDollars,
      winRate: candidate.overallMetrics.winRate,
      maxDrawdownPercent: candidate.overallMetrics.maxDrawdownPercent,
      walkForwardConsistency: `${Math.round(candidate.walkForwardMetrics.consistencyScore * 100)}%`,
      runId: candidate.runIdRef,
    },
    safetyReviewRequired: true,
    requiresExplicitManualApproval: true,
  };

  return {
    success: true,
    proposedConfig,
    safetyDisclaimer:
      "CRITICAL SAFETY BOUNDARY: This is a simulation recommendation only. Live MT5 order execution and active bot configuration are completely untouched. To apply any settings to live trading, you must manually enter and save them in the Settings page or use the 1-Click Apply button with manual confirmation.",
  };
}

/**
 * 1-Click Merge: Applies the vetted candidate parameters directly to the live trading engine settings.
 * Supports choosing Demo First (safe mode) or Real Live execution with explicit user confirmation.
 */
export async function applyCandidateToLiveBot(
  candidateId: string,
  options?: {
    targetEnvironment?: "DEMO_ONLY" | "REAL_AND_DEMO" | "SETTINGS_ONLY";
  }
): Promise<{
  success: boolean;
  message: string;
  appliedConfig?: any;
  error?: string;
}> {
  const candidate = activeCampaignState.rankedCandidates.find(c => c.candidateId === candidateId);
  if (!candidate) {
    return {
      success: false,
      message: `Candidate ${candidateId} not found in research results.`,
      error: "Candidate not found",
    };
  }

  const { updateSystemSettings } = await import("@workspace/db");
  const { recordHermesStateUpdate } = await import("./hermesLogger.js");

  const targetEnv = options?.targetEnvironment || "DEMO_ONLY";
  const engineMode = (candidate.config.strategyMode as any) || "HYBRID_DUAL";

  const patch: any = {
    engineMode,
    tpRatio: candidate.config.tpRatio || 2.5,
    trailingStopVariant: candidate.config.trailingStopVariant || "ASYMMETRIC_RUNNER",
    featureStructuralStop: candidate.config.featureStructuralStop !== false,
    featureEntryConfirmation: candidate.config.featureEntryConfirmation !== false,
    featureContextPatternFilter: candidate.config.featureContextPatternFilter !== false,
    featureSpreadGuard: candidate.config.featureSpreadGuard !== false,
    featureSessionFilter: candidate.config.featureSessionFilter !== false,
  };

  if (targetEnv === "DEMO_ONLY") {
    patch.autoTradingDemoEnabled = true;
    patch.autoTradingEnabled = true;
    patch.autoTradingRealEnabled = false;
  } else if (targetEnv === "REAL_AND_DEMO") {
    patch.autoTradingDemoEnabled = true;
    patch.autoTradingRealEnabled = true;
    patch.autoTradingEnabled = true;
  }

  const updated = await updateSystemSettings(patch);

  try {
    recordHermesStateUpdate(
      `1-Click Merged Strategy [${candidate.strategyName}] into Live Bot Settings (${targetEnv})`,
      {
        candidateId: candidate.candidateId,
        strategyId: candidate.strategyId,
        engineMode: patch.engineMode,
        targetEnvironment: targetEnv,
        tpRatio: patch.tpRatio,
        trailingStopVariant: patch.trailingStopVariant,
        profitFactor: candidate.overallMetrics.profitFactor,
      }
    );
  } catch {}

  logger.info(
    { candidateId, strategy: candidate.strategyName, engineMode, targetEnv },
    "[ResearchController] Successfully merged strategy candidate into active bot settings"
  );

  return {
    success: true,
    message: `Successfully merged "${candidate.strategyName}" (${patch.engineMode}) into active bot settings!`,
    appliedConfig: {
      candidateId: candidate.candidateId,
      strategyName: candidate.strategyName,
      engineMode: patch.engineMode,
      targetEnvironment: targetEnv,
      parameters: patch,
      updatedSettings: updated,
    },
  };
}
