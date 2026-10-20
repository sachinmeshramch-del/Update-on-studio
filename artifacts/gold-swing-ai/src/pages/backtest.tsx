import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Play,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Layers,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Sliders,
  Sparkles,
  BarChart3,
  Calendar,
  Download,
  Activity,
  ArrowLeft,
  ChevronRight,
  Filter,
  Eye,
  Check,
  RefreshCw,
  Upload,
  AlertTriangle,
  Zap,
  Info,
  Target,
  Brain,
} from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { AutonomousResearchPanel } from "@/components/trading/autonomous-research-panel";

interface BacktestSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  initialBalance: number;
  finalBalance: number;
  netProfitDollars: number;
  netProfitPercent: number;
  netProfitPoints: number;
  grossProfit?: number;
  grossLoss?: number;
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
  runnerTradesCount?: number;
  intrabarAmbiguitiesCount?: number;
  strategyMode?: string;
  strategyName?: string;
  totalEligibleSignals?: number;
  totalRejectedSignals?: number;
  rejectionsByFilter?: Record<string, number>;
}

interface BacktestTrade {
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
  session: string;
  regime: string;
  exitReason: string;
  balanceAfter: number;
  runnerActivated?: boolean;
  peakProfitPoints?: number;
  intrabarAmbiguity?: boolean;
  strategyMode?: string;
  strategyName?: string;
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

interface CategoryBreakdown {
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

interface MonthlyBreakdown {
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

interface AblationScenarioResult {
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

interface EquityCurvePoint {
  time: string;
  tradeIndex: number;
  balance: number;
  equity: number;
  drawdownDollars: number;
  drawdownPercent: number;
}

interface TrailingVariantResult {
  variant: string;
  label: string;
  activationThreshold?: string;
  stopDistanceRule?: string;
  updateFrequency?: string;
  exitRule?: string;
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

interface SplitMetrics {
  name: "TRAIN" | "VALIDATION" | "TEST_OOS";
  tradeCount: number;
  winRate: number;
  netProfitDollars: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownPercent: number;
}

interface StrategyEvaluationItem {
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

interface ExecutionCostModel {
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
}

interface HistoricalCoverageSummary {
  accountRef: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  firstCandleUTC: string | null;
  lastCandleUTC: string | null;
  gapCount: number;
  freshnessMinutes: number;
  dataQuality: "EXCELLENT" | "GOOD" | "GAPS_DETECTED" | "EMPTY";
}

export default function BacktestPage() {
  const [timeframe, setTimeframe] = useState<string>("5m");
  const [candleCount, setCandleCount] = useState<number>(1000);
  const [initialBalance, setInitialBalance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("gold_swing_backtest_initial_balance");
      return saved ? Number(saved) : 150;
    } catch {
      return 150;
    }
  });
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [spread, setSpread] = useState<number>(0.45);

  // Strategy Feature Flags
  const [featureStructuralStop, setFeatureStructuralStop] = useState<boolean>(true);
  const [featureEntryConfirmation, setFeatureEntryConfirmation] = useState<boolean>(true);
  const [featureContextPatternFilter, setFeatureContextPatternFilter] = useState<boolean>(true);
  const [featureSpreadGuard, setFeatureSpreadGuard] = useState<boolean>(true);
  const [featureSessionFilter, setFeatureSessionFilter] = useState<boolean>(true);
  const [trailingStopVariant, setTrailingStopVariant] = useState<
    "ASYMMETRIC_RUNNER" | "FIXED_DISTANCE" | "ATR_TRAILING" | "BREAKEVEN_ONLY" | "PROFIT_TRIGGERED" | "NO_TRAILING"
  >("ASYMMETRIC_RUNNER");

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncingData, setIsSyncingData] = useState<boolean>(false);
  const [coverage, setCoverage] = useState<HistoricalCoverageSummary | null>(null);

  const { data: settingsData } = useQuery<{ engineMode?: string }>({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings").then(r => r.json()),
    staleTime: 4000,
  });

  const { data: orbStateData } = useQuery<{ engineMode?: string }>({
    queryKey: ["/api/hermes/orb-state"],
    queryFn: () => fetch("/api/hermes/orb-state").then(r => r.json()),
    staleTime: 4000,
  });

  const liveBotMode = settingsData?.engineMode || orbStateData?.engineMode || (typeof window !== "undefined" ? localStorage.getItem("gold_swing_engine_mode") : null) || "HYBRID_DUAL";

  const [engineMode, setEngineMode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gold_swing_backtest_strategy") || localStorage.getItem("gold_swing_engine_mode") || "HYBRID_DUAL";
    }
    return "HYBRID_DUAL";
  });

  useEffect(() => {
    if (liveBotMode) {
      const explicit = typeof window !== "undefined" ? localStorage.getItem("gold_swing_backtest_strategy_manual") : null;
      if (!explicit) {
        setEngineMode(liveBotMode);
      }
    }
  }, [liveBotMode]);

  const strategyDetails = useMemo(() => {
    if (engineMode === "DETERMINISTIC_ORB") {
      return {
        name: "Active Strategy: Pure Deterministic NY 3h ORB Engine",
        badge: "Pure 3h NY ORB",
        description: "100% deterministic mathematical execution. Fires at 16:00 UTC if price breaks out of the 13:00-15:00 UTC 3-hour window and aligns with EMA50. Strict 5R profit target and dynamic ATR stop-loss."
      };
    } else if (engineMode === "HERMES_ADAPTIVE") {
      return {
        name: "Active Strategy: Hermes AI Adaptive Confluence",
        badge: "Adaptive AI Confluence",
        description: "Multi-indicator adaptive confluence engine with autonomous hyper-parameter reflection across sessions and swing reversals."
      };
    }
    return {
      name: "Active Strategy: Hybrid Dual-Engine Scalper",
      badge: "100% Live Synced",
      description: "Simulates the exact rules of your live bot: Hermes SMC Confluence (EMA 9/21/50 alignment + RSI sweet-spot 40-58/42-60 + MACD histogram + 15m Order Blocks & Sweeps + 2-Candle Confirmation), Dynamic Structural Stops (10-bar swing extreme + 0.5×ATR), and Asymmetric Runners (locks BE at +1.0 pt, locks +1.0 pt profit at +1.3 pts, unlocks runner expansion at 85% TP target, and progressive tier trailing)."
    };
  }, [engineMode]);

  const [result, setResult] = useState<{
    runId: string;
    runTimestamp: string;
    summary: BacktestSummary;
    breakdownBySession: CategoryBreakdown[];
    breakdownByPattern: CategoryBreakdown[];
    breakdownByRegime: CategoryBreakdown[];
    breakdownByDirection?: CategoryBreakdown[];
    breakdownByStrategy?: CategoryBreakdown[];
    monthlyBreakdown?: MonthlyBreakdown[];
    variantComparison: TrailingVariantResult[];
    ablationMatrix?: AblationScenarioResult[];
    oosValidation: {
      train: SplitMetrics;
      validation: SplitMetrics;
      test: SplitMetrics;
      flagWarnings: string[];
    };
    equityCurve: EquityCurvePoint[];
    trades: BacktestTrade[];
    evaluationLogs?: StrategyEvaluationItem[];
    executionCostModel?: ExecutionCostModel;
  } | null>(null);

  const [viewMode, setViewMode] = useState<"AUTONOMOUS_RESEARCH" | "SINGLE_BACKTEST">("AUTONOMOUS_RESEARCH");
  const [activeTab, setActiveTab] = useState<
    "RESEARCH_CONTROLLER" | "EQUITY" | "ATTRIBUTION" | "EVAL_LOG" | "ABLATION" | "VARIANTS" | "VALIDATION" | "MONTHLY" | "SESSIONS" | "PATTERNS" | "TRADES" | "COST_MODEL" | "DATA_MANAGER"
  >("RESEARCH_CONTROLLER");
  const [tradeFilter, setTradeFilter] = useState<"ALL" | "WINS" | "LOSSES" | "LONG" | "SHORT">("ALL");
  const [evalFilter, setEvalFilter] = useState<"ALL" | "BUY" | "SELL" | "REJECTED" | "NO_SIGNAL">("ALL");
  const [selectedTrade, setSelectedTrade] = useState<BacktestTrade | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load historical coverage on mount and timeframe change
  useEffect(() => {
    fetchCoverage();
  }, [timeframe]);

  async function fetchCoverage() {
    try {
      const res = await fetch(`/api/history/candles/summary?timeframe=${timeframe}`);
      if (res.ok) {
        const data = await res.json();
        setCoverage(data.coverage);
      }
    } catch {}
  }

  async function handleSyncMetaApi() {
    setIsSyncingData(true);
    try {
      const res = await fetch("/api/history/candles/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeframe, count: candleCount }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Sync failed");
      }
      toast.success(`Synced ${data.newCandles} new candles from MetaApi! Total stored: ${data.totalStored}`);
      setCoverage(data.summary);
    } catch (err: any) {
      toast.error(err.message || "Failed to sync historical candles");
    } finally {
      setIsSyncingData(false);
    }
  }

  function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      try {
        const res = await fetch("/api/history/candles/import-csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: text, timeframe }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`Successfully imported and upserted ${data.imported} candles!`);
          fetchCoverage();
        } else {
          toast.error(data.errors?.[0] || "Failed to import CSV");
        }
      } catch (err: any) {
        toast.error(err.message || "CSV upload error");
      }
    };
    reader.readAsText(file);
  }

  async function executeBacktest(overrideParams?: any) {
    setIsLoading(true);
    try {
      const payload = {
        timeframe,
        candleCount,
        initialBalance,
        riskPercent,
        spread,
        featureStructuralStop,
        featureEntryConfirmation,
        featureContextPatternFilter,
        featureSpreadGuard,
        featureSessionFilter,
        trailingStopVariant,
        strategyMode: engineMode,
        ...overrideParams,
      };

      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Backtest failed");
      }

      setResult(data);
      setActiveTab("TRADES"); // Automatically display executed trade journal
      toast.success(`Backtest complete! Simulated ${data.summary.totalTrades} trades (${data.summary.winRate}% WR)`);
      fetchCoverage();
    } catch (err: any) {
      toast.error(err.message || "Failed to execute backtest");
    } finally {
      setIsLoading(false);
    }
  }

  function applyPreset(preset: "OPTIMIZED" | "LEGACY") {
    if (preset === "OPTIMIZED") {
      setFeatureStructuralStop(true);
      setFeatureEntryConfirmation(true);
      setFeatureContextPatternFilter(true);
      setFeatureSpreadGuard(true);
      setFeatureSessionFilter(true);
      setTrailingStopVariant("ASYMMETRIC_RUNNER");
      toast.info("Applied Live Bot Optimized Settings (Hybrid SMC Confluence + Asymmetric Runners)");
    } else {
      setFeatureStructuralStop(false);
      setFeatureEntryConfirmation(false);
      setFeatureContextPatternFilter(false);
      setFeatureSpreadGuard(false);
      setFeatureSessionFilter(false);
      setTrailingStopVariant("NO_TRAILING");
      toast.info("Applied Legacy Baseline Settings (Unfiltered & Fixed SL/TP)");
    }
  }

  // Filtered trades for table
  const filteredTrades = useMemo(() => {
    if (!result?.trades) return [];
    return result.trades.filter(t => {
      if (tradeFilter === "WINS") return t.outcome === "WIN";
      if (tradeFilter === "LOSSES") return t.outcome === "LOSS";
      if (tradeFilter === "LONG") return t.direction === "LONG";
      if (tradeFilter === "SHORT") return t.direction === "SHORT";
      return true;
    });
  }, [result?.trades, tradeFilter]);

  function exportBacktestCsv() {
    if (!result?.trades || result.trades.length === 0) return;
    const headers = [
      "TradeId,EntryTime,ExitTime,Direction,Pattern,Session,Regime,EntryPrice,StopLoss,TakeProfit,ExitPrice,PnLPoints,PnLDollars,ROutcome,Outcome,MAEPoints,MFEPoints,DurationMinutes,BalanceAfter,RunnerActivated,ExitReason"
    ];
    const rows = result.trades.map(t => [
      t.id, t.entryTime, t.exitTime, t.direction, `"${t.pattern}"`, t.session, t.regime,
      t.entryPrice, t.stopLoss, t.takeProfit, t.exitPrice, t.pnlPoints, t.pnlDollars,
      t.rOutcome, t.outcome, t.maePoints, t.mfePoints, t.durationMinutes, t.balanceAfter,
      t.runnerActivated ? "TRUE" : "FALSE", t.exitReason
    ].join(","));

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `backtest_${timeframe}_${result.summary.totalTrades}trades.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Backtest trade results exported as CSV");
  }

  // Equity Curve & Underwater Drawdown SVG coordinates
  const svgChart = useMemo(() => {
    if (!result?.equityCurve || result.equityCurve.length < 2) return null;
    const curve = result.equityCurve;
    const balances = curve.map(c => c.balance);
    const minBal = Math.min(...balances);
    const maxBal = Math.max(...balances);
    const range = Math.max(1, maxBal - minBal);

    const width = 800;
    const height = 240;
    const padding = 20;

    const points = curve.map((c, idx) => {
      const x = padding + (idx / (curve.length - 1)) * (width - padding * 2);
      const y = height - padding - ((c.balance - minBal) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    // Underwater Drawdown points (0% at top, maxDd at bottom)
    const drawdowns = curve.map(c => c.drawdownPercent);
    const maxDdVal = Math.max(1, ...drawdowns);
    const ddPoints = curve.map((c, idx) => {
      const x = padding + (idx / (curve.length - 1)) * (width - padding * 2);
      const y = padding + (c.drawdownPercent / maxDdVal) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    return { points, ddPoints, maxDdVal, minBal, maxBal, width, height };
  }, [result?.equityCurve]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-grow container mx-auto px-2 sm:px-4 py-4 md:py-8 flex flex-col gap-6">
        {/* Navigation Breadcrumb & Action Presets */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Link href="/">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground bg-black/5 dark:bg-white/5 border border-border transition-all">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
            </Link>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">Quantitative Strategy Backtester</span>
              <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-400 bg-amber-500/10">
                Persistent MetaApi OHLC Feed
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-border">
              <button
                onClick={() => setViewMode("AUTONOMOUS_RESEARCH")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
                  viewMode === "AUTONOMOUS_RESEARCH"
                    ? "bg-amber-500 text-black shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Autonomous Research Engine</span>
              </button>
              <button
                onClick={() => setViewMode("SINGLE_BACKTEST")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
                  viewMode === "SINGLE_BACKTEST"
                    ? "bg-amber-500 text-black shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Single Backtest Mode</span>
              </button>
            </div>

            {viewMode === "SINGLE_BACKTEST" && (
              <>
                <button
                  onClick={() => applyPreset("OPTIMIZED")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all shadow-sm cursor-pointer"
                  title="Apply all verified live quantitative filters & asymmetric runners"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Optimized Live Bot</span>
                </button>
                <button
                  onClick={() => applyPreset("LEGACY")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30 hover:bg-zinc-500/25 transition-all cursor-pointer"
                  title="Test legacy bot behavior without filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Legacy Unfiltered</span>
                </button>
              </>
            )}
          </div>
        </div>

        {viewMode === "AUTONOMOUS_RESEARCH" ? (
          <AutonomousResearchPanel />
        ) : (
          <>

        {/* Strategy Information Banner */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-foreground text-sm flex items-center gap-2">
                <span>{strategyDetails.name}</span>
                <Badge className="bg-amber-500 text-black text-[10px] font-bold">{strategyDetails.badge}</Badge>
              </div>
              <p className="text-muted-foreground mt-0.5 leading-relaxed">
                {strategyDetails.description}
              </p>
            </div>
          </div>
        </div>

        {/* Configuration Panel */}
        <Card className="border-border bg-card/60 shadow-md overflow-hidden">
          <CardHeader className="py-4 px-4 sm:px-6 border-b border-border bg-black/20">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-500" />
                  <span>Historical Simulation Parameters</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Simulate bar-by-bar execution on real MetaApi spot gold candles with Ask/Bid spread, slippage, and dynamic risk management
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => executeBacktest()}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black shadow-lg disabled:opacity-50 transition-all active:scale-95"
                >
                  <Play className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : "fill-black"}`} />
                  <span>{isLoading ? "Running Simulation…" : "Run Backtest"}</span>
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6 space-y-5">
            {/* Strategy Selection Row */}
            <div className="p-3 rounded-xl bg-black/30 border border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Backtest Strategy Engine
                  </span>
                  <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/10 border-amber-500/30 text-amber-500">
                    {engineMode === "DETERMINISTIC_ORB" ? "Pure 3h NY ORB" : engineMode === "HERMES_ADAPTIVE" ? "Hermes Adaptive AI" : "Hybrid Dual-Engine"}
                  </Badge>
                  {engineMode === liveBotMode ? (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ In Sync with Live Bot
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setEngineMode(liveBotMode);
                        localStorage.removeItem("gold_swing_backtest_strategy_manual");
                        localStorage.setItem("gold_swing_backtest_strategy", liveBotMode);
                        toast.info(`Synced backtest strategy to Live Bot Mode (${liveBotMode.replace(/_/g, " ")})`);
                      }}
                      className="text-[10px] font-semibold text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 px-2 py-0.5 rounded border border-amber-500/30 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Sync to Live Bot ({liveBotMode.replace(/_/g, " ")})</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Select which mathematical engine to evaluate against historical spot gold data
                </p>
              </div>

              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-black/40 border border-border">
                {[
                  { id: "DETERMINISTIC_ORB", label: "Pure ORB", icon: Target },
                  { id: "HYBRID_DUAL", label: "Hybrid Dual", icon: Zap },
                  { id: "HERMES_ADAPTIVE", label: "Adaptive AI", icon: Brain },
                ].map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = engineMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setEngineMode(mode.id);
                        localStorage.setItem("gold_swing_backtest_strategy_manual", "true");
                        localStorage.setItem("gold_swing_backtest_strategy", mode.id);
                        toast.info(`Backtest Strategy switched to ${mode.label}`);
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                        isSelected
                          ? "bg-amber-500 text-black shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Historical Data Synchronization & Cost Model Banner */}
            <div className="p-3.5 rounded-xl bg-black/25 border border-border/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-500" />
                    <span>Historical MetaApi Feed Status:</span>
                  </span>
                  <Badge variant="outline" className={`text-[10px] font-mono font-bold ${
                    coverage?.dataQuality === "EXCELLENT" || coverage?.dataQuality === "GOOD"
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                  }`}>
                    {coverage?.dataQuality || "READY"} ({coverage?.candleCount || 0} stored vs {candleCount} requested)
                  </Badge>
                  {coverage?.gapCount !== undefined && coverage.gapCount > 0 && (
                    <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-500/30 bg-amber-500/10">
                      {coverage.gapCount} data gaps detected
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
                  <span>Earliest: <strong className="text-foreground font-mono">{coverage?.firstCandleUTC ? new Date(coverage.firstCandleUTC).toUTCString().slice(5, 22) : "Fetching..."}</strong></span>
                  <span>•</span>
                  <span>Latest: <strong className="text-foreground font-mono">{coverage?.lastCandleUTC ? new Date(coverage.lastCandleUTC).toUTCString().slice(5, 22) : "Fetching..."}</strong></span>
                  <span>•</span>
                  <span>Contract: <strong className="text-foreground">XAUUSD (100 oz/lot)</strong></span>
                  <span>•</span>
                  <span>Round-Trip Spread: <strong className="text-foreground font-mono">0.45 pts ($45/lot)</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSyncMetaApi}
                  disabled={isSyncingData}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/20 hover:bg-black/40 text-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Synchronize fresh OHLC candles directly from MetaApi server"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isSyncingData ? "animate-spin" : ""}`} />
                  <span>{isSyncingData ? "Syncing Feed…" : "Sync MetaApi Data"}</span>
                </button>
              </div>
            </div>

            {/* Main Parameters Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Timeframe</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full bg-black/20 border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-amber-500"
                >
                  <option value="1m">1m (Fast Scalp)</option>
                  <option value="5m">5m (Primary Intraday)</option>
                  <option value="15m">15m (Swing Structure)</option>
                  <option value="1h">1h (Macro Trend)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Historical Candles</label>
                <select
                  value={candleCount}
                  onChange={(e) => setCandleCount(Number(e.target.value))}
                  className="w-full bg-black/20 border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-amber-500"
                >
                  <option value={300}>300 candles (~1 day)</option>
                  <option value={600}>600 candles (~2 days)</option>
                  <option value={1000}>1,000 candles (~3.5 days)</option>
                  <option value={2000}>2,000 candles (~1 week)</option>
                  <option value={3000}>3,000 candles (Max available)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Starting Balance ($)</label>
                <input
                  type="number"
                  value={initialBalance}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setInitialBalance(val);
                    try {
                      localStorage.setItem("gold_swing_backtest_initial_balance", String(val));
                    } catch {}
                  }}
                  className="w-full bg-black/20 border border-border rounded-lg px-3 py-2 text-xs font-semibold font-mono text-foreground focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Risk Per Trade (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="w-full bg-black/20 border border-border rounded-lg px-3 py-2 text-xs font-semibold font-mono text-foreground focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Spread (pts)</label>
                <input
                  type="number"
                  step="0.05"
                  value={spread}
                  onChange={(e) => setSpread(Number(e.target.value))}
                  className="w-full bg-black/20 border border-border rounded-lg px-3 py-2 text-xs font-semibold font-mono text-foreground focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Trailing Stop</label>
                <select
                  value={trailingStopVariant}
                  onChange={(e) => setTrailingStopVariant(e.target.value as any)}
                  className="w-full bg-black/20 border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-amber-500"
                >
                  <option value="ASYMMETRIC_RUNNER">Asymmetric Runner (Live Bot)</option>
                  <option value="FIXED_DISTANCE">Fixed 4.0 pt Trail</option>
                  <option value="ATR_TRAILING">ATR Trail (2.0x ATR)</option>
                  <option value="BREAKEVEN_ONLY">Breakeven Only (+0.2 buffer)</option>
                  <option value="PROFIT_TRIGGERED">Profit-Triggered (+1.0 at +2.5)</option>
                  <option value="NO_TRAILING">No Trailing (Fixed SL/TP)</option>
                </select>
              </div>
            </div>

            {/* Strategy Feature Flag Toggles */}
            <div className="pt-2 border-t border-border">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 block mb-3">
                Strategy Feature Flags to Test
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {[
                  {
                    id: "structuralStop",
                    label: "Structural Swing Stop",
                    desc: "Anchors SL to 10-candle swing extreme with 0.5x ATR buffer (1:2.5 RR)",
                    checked: featureStructuralStop,
                    onChange: setFeatureStructuralStop,
                  },
                  {
                    id: "entryConfirmation",
                    label: "Candle Confirmation",
                    desc: "Requires next 5m candle close beyond pattern extreme (2-bar window)",
                    checked: featureEntryConfirmation,
                    onChange: setFeatureEntryConfirmation,
                  },
                  {
                    id: "contextFilter",
                    label: "Context Pattern Filter",
                    desc: "Drops unanchored Dojis and counter-trend engulfings",
                    checked: featureContextPatternFilter,
                    onChange: setFeatureContextPatternFilter,
                  },
                  {
                    id: "sessionFilter",
                    label: "London/NY Session Guard",
                    desc: "Restricts entries to 07:00-20:00 UTC (skips Asian & rollover)",
                    checked: featureSessionFilter,
                    onChange: setFeatureSessionFilter,
                  },
                  {
                    id: "spreadGuard",
                    label: "Spread Friction Guard",
                    desc: "Skips signals when spread > 8% of SL distance or > 0.60 pts",
                    checked: featureSpreadGuard,
                    onChange: setFeatureSpreadGuard,
                  },
                ].map(flag => (
                  <label
                    key={flag.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                      flag.checked
                        ? "bg-amber-500/10 border-amber-500/40 text-foreground"
                        : "bg-black/10 dark:bg-white/5 border-border text-muted-foreground opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={flag.checked}
                      onChange={(e) => flag.onChange(e.target.checked)}
                      className="mt-0.5 rounded border-border text-amber-500 focus:ring-amber-500"
                    />
                    <div className="text-left">
                      <span className="text-xs font-bold block">{flag.label}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight block mt-0.5">{flag.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backtest Results Dashboard */}
        {result && (
          <div className="space-y-6">
            {/* KPI Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Win Rate</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className={`text-2xl font-mono font-bold ${
                    result.summary.winRate >= 50 ? "text-emerald-400" : result.summary.winRate >= 35 ? "text-amber-400" : "text-rose-400"
                  }`}>
                    {result.summary.winRate}%
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    ({result.summary.winningTrades}W / {result.summary.losingTrades}L)
                  </span>
                </div>
              </Card>

              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Net Profit</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-2xl font-mono font-bold flex items-center ${
                    (result.summary.netProfitDollars ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    {(result.summary.netProfitDollars ?? 0) >= 0 ? "+" : ""}${Number(result.summary.netProfitDollars ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5 flex items-center justify-between">
                  <span className="text-emerald-400">+${result.summary.grossProfit ?? 0}</span>
                  <span>/</span>
                  <span className="text-rose-400">-${result.summary.grossLoss ?? 0}</span>
                </div>
              </Card>

              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Profit Factor</span>
                <span className={`text-2xl font-mono font-bold block mt-1 ${
                  (result.summary.profitFactor ?? 0) >= 1.5 ? "text-emerald-400" : (result.summary.profitFactor ?? 0) >= 1.0 ? "text-amber-400" : "text-rose-400"
                }`}>
                  {Number(result.summary.profitFactor ?? 0).toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground">Gross Win / Gross Loss</span>
              </Card>

              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Expectancy</span>
                <span className={`text-2xl font-mono font-bold block mt-1 ${
                  (result.summary.expectancyR ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}>
                  {(result.summary.expectancyR ?? 0) >= 0 ? "+" : ""}{Number(result.summary.expectancyR ?? 0).toFixed(3)} R
                </span>
                <span className="text-[10px] text-muted-foreground">Per Trade Return</span>
              </Card>

              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Max Drawdown</span>
                <span className="text-2xl font-mono font-bold text-rose-400 block mt-1">
                  -{result.summary.maxDrawdownPercent ?? 0}%
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">-${Number(result.summary.maxDrawdownDollars ?? 0).toLocaleString()}</span>
              </Card>

              <Card
                onClick={() => setActiveTab("TRADES")}
                className="border-border bg-card/60 p-4 cursor-pointer hover:border-amber-500/60 hover:bg-amber-500/5 transition-all group"
                title="Click to view detailed trade journal and attribution"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Total Trades</span>
                  <Badge variant="outline" className="text-[9px] group-hover:bg-amber-500/20 text-amber-400 border-amber-500/30">View Log →</Badge>
                </div>
                <span className="text-2xl font-mono font-bold text-foreground block mt-1">
                  {result.summary.totalTrades}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate">
                  Signals: {result.summary.totalEligibleSignals || result.summary.totalTrades} / Rej: {result.summary.totalRejectedSignals || 0}
                </span>
              </Card>
            </div>

            {/* Rejection Diagnostics Strip */}
            {result.summary.rejectionsByFilter && (
              <div className="p-3 rounded-xl bg-black/20 border border-border/60 text-xs flex items-center justify-between flex-wrap gap-2">
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-amber-500" />
                  <span>Filter Rejection Breakdown across {result.summary.candlesEvaluated} candles:</span>
                </span>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span>Session Guard: <strong className="text-foreground">{result.summary.rejectionsByFilter.sessionGuard || 0}</strong></span>
                  <span>•</span>
                  <span>Entry Confirmation: <strong className="text-foreground">{result.summary.rejectionsByFilter.entryConfirmation || 0}</strong></span>
                  <span>•</span>
                  <span>Pattern Filter: <strong className="text-foreground">{result.summary.rejectionsByFilter.patternFilter || 0}</strong></span>
                  <span>•</span>
                  <span>Spread Friction: <strong className="text-foreground">{result.summary.rejectionsByFilter.spreadGuard || 0}</strong></span>
                </div>
              </div>
            )}

            {result.trades.length === 0 && (
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <span className="font-bold text-foreground block">No Backtest Trades Triggered In This Window</span>
                  <p className="text-muted-foreground leading-relaxed">
                    0 trades satisfied all quantitative entry filters across the selected {result.summary.candlesEvaluated} candles on {timeframe}.
                  </p>
                  <p className="text-amber-400/90 font-medium pt-1">
                    💡 Suggested fix: Select <strong>5m</strong> or <strong>15m</strong> timeframe, increase candle count to <strong>1000</strong>, or toggle off <strong>London/NY Session Guard</strong> above to simulate 24-hour execution.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation Tabs for Views */}
            <div className="flex items-center justify-between border-b border-border pb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { id: "RESEARCH_CONTROLLER", label: "Autonomous Research Controller", icon: Brain },
                  { id: "TRADES", label: `Trade Journal (${result.trades.length})`, icon: BarChart3 },
                  { id: "ATTRIBUTION", label: "Strategy Attribution", icon: Target },
                  { id: "EVAL_LOG", label: `Evaluation Log (${result.evaluationLogs?.length || 0})`, icon: Activity },
                  { id: "ABLATION", label: "Filter Ablation Matrix (8 Scenarios)", icon: Filter },
                  { id: "VARIANTS", label: "Fair Trailing Comparison (6 Modes)", icon: Sliders },
                  { id: "EQUITY", label: "Equity & Drawdown Curves", icon: TrendingUp },
                  { id: "VALIDATION", label: "OOS Split (60/20/20)", icon: ShieldCheck },
                  { id: "MONTHLY", label: `Monthly Results (${result.monthlyBreakdown?.length || 0})`, icon: Calendar },
                  { id: "COST_MODEL", label: "Spread & Cost Model", icon: Info },
                  { id: "SESSIONS", label: "Session Performance", icon: Clock },
                  { id: "PATTERNS", label: "Pattern Confluence", icon: Layers },
                  { id: "DATA_MANAGER", label: "Historical Data Storage", icon: Activity },
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        activeTab === tab.id
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {activeTab === "TRADES" && (
                <button
                  onClick={exportBacktestCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/10 dark:bg-white/5 border border-border hover:bg-black/20 text-foreground transition-all"
                  title="Export simulated trades to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-amber-500" />
                  <span>Export CSV</span>
                </button>
              )}
            </div>

            {/* Tab: Autonomous Research Controller */}
            {activeTab === "RESEARCH_CONTROLLER" && (
              <AutonomousResearchPanel />
            )}

            {/* Tab 1: Trade Journal with Interactive Attribution Click */}
            {activeTab === "TRADES" && (
              <Card className="border-border bg-card/60 overflow-hidden shadow-sm">
                <CardHeader className="py-3 px-4 border-b border-border bg-black/20 flex flex-row items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">Executed Trade Journal</span>
                    <span className="text-xs text-muted-foreground font-mono">({filteredTrades.length} displayed · Click any row to inspect full strategy attribution)</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    {(["ALL", "WINS", "LOSSES", "LONG", "SHORT"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setTradeFilter(f)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                          tradeFilter === f
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-black/10 dark:bg-white/5 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </CardHeader>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-black/40 text-[10px] text-muted-foreground uppercase border-b border-border font-semibold">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Time</th>
                        <th className="p-3">Signal</th>
                        <th className="p-3">Attributed Strategy</th>
                        <th className="p-3">Entry</th>
                        <th className="p-3">SL</th>
                        <th className="p-3">TP</th>
                        <th className="p-3">Exit</th>
                        <th className="p-3 text-right">PnL (pts)</th>
                        <th className="p-3 text-right">PnL ($)</th>
                        <th className="p-3 text-right">R</th>
                        <th className="p-3">Exit Reason</th>
                        <th className="p-3">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {filteredTrades.map(t => (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTrade(t)}
                          className="hover:bg-amber-500/5 cursor-pointer transition-colors"
                        >
                          <td className="p-3 text-muted-foreground font-sans">{t.id}</td>
                          <td className="p-3 text-muted-foreground font-sans whitespace-nowrap">
                            {new Date(t.entryTime).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="p-3">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.direction === "LONG" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                            }`}>
                              {t.direction}
                            </span>
                          </td>
                          <td className="p-3 font-sans">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-foreground">{t.strategyName || t.pattern}</span>
                              {t.strategyId && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-muted-foreground">
                                  {t.strategyId}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-foreground font-semibold">{formatPrice(t.entryPrice)}</td>
                          <td className="p-3 text-rose-400">{formatPrice(t.stopLoss)}</td>
                          <td className="p-3 text-emerald-400">{formatPrice(t.takeProfit)}</td>
                          <td className="p-3 text-foreground">{formatPrice(t.exitPrice)}</td>
                          <td className={`p-3 text-right font-bold ${t.pnlPoints >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {t.pnlPoints >= 0 ? "+" : ""}{t.pnlPoints.toFixed(2)}
                          </td>
                          <td className={`p-3 text-right font-bold ${t.pnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {t.pnlDollars >= 0 ? "+" : ""}${t.pnlDollars.toFixed(2)}
                          </td>
                          <td className={`p-3 text-right font-bold ${t.rOutcome >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {t.rOutcome >= 0 ? "+" : ""}{t.rOutcome.toFixed(2)}R
                          </td>
                          <td className="p-3 font-sans text-[11px] text-muted-foreground">
                            {t.runnerActivated && <Badge className="bg-amber-500/20 text-amber-400 text-[9px] mr-1">Runner</Badge>}
                            {t.exitReason}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              t.outcome === "WIN" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            }`}>
                              {t.outcome === "WIN" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {t.outcome}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Tab 2: Dedicated Strategy Attribution Matrix */}
            {activeTab === "ATTRIBUTION" && (
              <div className="space-y-4">
                <Card className="border-border bg-card/60 p-5 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Target className="w-4 h-4 text-amber-500" />
                      <span>Quantitative Strategy Attribution Architecture</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Rigorous attribution decomposes each executed trade into its Primary Strategy Engine, Strategy Version, internal contributing sub-engines, exact triggering conditions, and active feature flag verification.
                    </p>
                  </div>

                  {result.breakdownByStrategy && result.breakdownByStrategy.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      {result.breakdownByStrategy.map(st => (
                        <div key={st.name} className="p-3.5 rounded-xl bg-black/25 border border-border/60 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground truncate">{st.name}</span>
                            <Badge className="bg-amber-500/20 text-amber-400 text-[10px] font-mono">{st.totalTrades} Trades</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="bg-black/20 p-2 rounded-lg">
                              <span className="text-[10px] text-muted-foreground block font-sans">Win Rate</span>
                              <span className="font-bold text-foreground">{st.winRate}%</span>
                            </div>
                            <div className="bg-black/20 p-2 rounded-lg">
                              <span className="text-[10px] text-muted-foreground block font-sans">Net PnL</span>
                              <span className={`font-bold ${st.netPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {st.netPnlDollars >= 0 ? "+" : ""}${st.netPnlDollars}
                              </span>
                            </div>
                            <div className="bg-black/20 p-2 rounded-lg">
                              <span className="text-[10px] text-muted-foreground block font-sans">Profit Factor</span>
                              <span className="font-bold text-foreground">{st.profitFactor.toFixed(2)}</span>
                            </div>
                            <div className="bg-black/20 p-2 rounded-lg">
                              <span className="text-[10px] text-muted-foreground block font-sans">Expectancy</span>
                              <span className={`font-bold ${st.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {st.expectancyR >= 0 ? "+" : ""}{st.expectancyR.toFixed(2)} R
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="border-border bg-card/60 overflow-hidden shadow-sm">
                  <CardHeader className="py-3 px-4 border-b border-border bg-black/20">
                    <CardTitle className="text-xs font-bold text-foreground">
                      Trade-by-Trade Signal Attribution Records ({result.trades.length})
                    </CardTitle>
                  </CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-black/40 text-[10px] text-muted-foreground uppercase border-b border-border font-semibold">
                        <tr>
                          <th className="p-3">Trade ID</th>
                          <th className="p-3">Direction</th>
                          <th className="p-3">Primary Strategy</th>
                          <th className="p-3">Version</th>
                          <th className="p-3">Contributing Internal Strategies</th>
                          <th className="p-3">Exact Trigger Conditions</th>
                          <th className="p-3">Filters Passed</th>
                          <th className="p-3 text-right">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-sans">
                        {result.trades.map(t => (
                          <tr key={t.id} className="hover:bg-white/5">
                            <td className="p-3 font-mono font-bold text-foreground">{t.id}</td>
                            <td className="p-3">
                              <Badge className={`text-[10px] font-bold ${
                                t.direction === "LONG" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              }`}>
                                {t.direction}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <span className="font-semibold text-foreground block">{t.strategyName}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">{t.strategyId}</span>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-muted-foreground">{t.strategyVersion || "v2.4.0"}</td>
                            <td className="p-3">
                              <div className="space-y-1">
                                {t.contributingStrategies?.map((c, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                    <strong className="text-foreground">{c.strategyName}:</strong>
                                    <span className="text-muted-foreground truncate max-w-xs">{c.reason}</span>
                                    <span className="font-mono text-[10px] text-amber-400 font-bold">({c.confidence}%)</span>
                                  </div>
                                )) || <span className="text-muted-foreground">Direct execution</span>}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="space-y-0.5 text-[11px] font-mono text-muted-foreground">
                                {t.conditionsTriggered?.map((cond, idx) => (
                                  <div key={idx}>✓ {cond}</div>
                                )) || <span>{t.pattern}</span>}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1 flex-wrap">
                                {t.filtersPassed?.map((f, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] py-0 px-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                    {f}
                                  </Badge>
                                )) || <span className="text-muted-foreground text-[10px]">Standard</span>}
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-amber-400">
                              {t.confidenceScore || 85}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* Tab 3: Strategy Evaluation Log */}
            {activeTab === "EVAL_LOG" && (
              <Card className="border-border bg-card/60 overflow-hidden shadow-sm space-y-3">
                <CardHeader className="py-3 px-4 border-b border-border bg-black/20 flex flex-row items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-500" />
                      <span>Chronological Strategy Evaluation Log</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Bar-by-bar chronological record of every evaluated candle, conditions satisfied/failed, indicator values, and filter rejection reasons (idempotent; no duplicate entries)
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    {(["ALL", "BUY", "SELL", "REJECTED", "NO_SIGNAL"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setEvalFilter(f)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                          evalFilter === f
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-black/10 dark:bg-white/5 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </CardHeader>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-black/40 text-[10px] text-muted-foreground uppercase border-b border-border font-semibold">
                      <tr>
                        <th className="p-3">Candle Timestamp</th>
                        <th className="p-3">Strategy</th>
                        <th className="p-3">Result</th>
                        <th className="p-3">Indicators (At Eval)</th>
                        <th className="p-3">Conditions Evaluated</th>
                        <th className="p-3">Rejection Reason / Outcome</th>
                        <th className="p-3 text-center">Trade Triggered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-sans">
                      {result.evaluationLogs
                        ?.filter(ev => {
                          if (evalFilter === "BUY") return ev.result === "BUY";
                          if (evalFilter === "SELL") return ev.result === "SELL";
                          if (evalFilter === "REJECTED") return ev.result === "REJECTED";
                          if (evalFilter === "NO_SIGNAL") return ev.result === "NO_SIGNAL";
                          return true;
                        })
                        .map(ev => (
                          <tr key={ev.id} className="hover:bg-white/5">
                            <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                              {new Date(ev.candleTimestamp).toUTCString().slice(5, 22)}
                            </td>
                            <td className="p-3">
                              <span className="font-semibold text-foreground block">{ev.strategyName}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">{ev.strategyVersion}</span>
                            </td>
                            <td className="p-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                ev.result === "BUY" ? "bg-emerald-500/20 text-emerald-400" :
                                ev.result === "SELL" ? "bg-rose-500/20 text-rose-400" :
                                ev.result === "REJECTED" ? "bg-amber-500/20 text-amber-400" :
                                "bg-zinc-500/20 text-zinc-400"
                              }`}>
                                {ev.result}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-[11px]">
                              <div className="text-muted-foreground space-y-0.5">
                                <div>RSI: <strong className="text-foreground">{ev.indicators?.rsi ?? "-"}</strong> · ATR: <strong className="text-foreground">{ev.indicators?.atr ?? "-"}</strong></div>
                                <div>EMA 9/21/50: <span className="text-foreground">{ev.indicators?.ema9}/{ev.indicators?.ema21}/{ev.indicators?.ema50}</span></div>
                                <div>MACD Hist: <strong className="text-foreground">{ev.indicators?.macdHist ?? "-"}</strong> · Spread: <strong className="text-foreground">{ev.indicators?.spread ?? "-"}</strong></div>
                              </div>
                            </td>
                            <td className="p-3 text-[11px] font-mono">
                              {ev.conditionsSatisfied?.length > 0 && (
                                <div className="text-emerald-400">
                                  {ev.conditionsSatisfied.map((c, idx) => <div key={idx}>✓ {c}</div>)}
                                </div>
                              )}
                              {ev.conditionsFailed?.length > 0 && (
                                <div className="text-rose-400/90 mt-0.5">
                                  {ev.conditionsFailed.map((c, idx) => <div key={idx}>✗ {c}</div>)}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-[11px] text-muted-foreground">
                              {ev.rejectionReason ? (
                                <span className="text-amber-400/90">{ev.rejectionReason}</span>
                              ) : (
                                <span className="text-emerald-400 font-semibold">All conditions satisfied & passed</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {ev.contributedToFinal ? (
                                <Badge className="bg-emerald-500 text-black text-[9px] font-bold">YES</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Tab 4: Strategy & Filter Ablation Testing Matrix */}
            {activeTab === "ABLATION" && (
              <Card className="border-border bg-card/60 overflow-hidden shadow-sm space-y-3">
                <CardHeader className="py-3 px-4 border-b border-border bg-black/20">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Filter className="w-4 h-4 text-amber-500" />
                      <span>Quantitative Strategy & Filter Ablation Testing Matrix</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Strictly evaluates the individual mathematical contribution of each feature flag by running identical market data with all flags enabled, each disabled individually, combination subsets, and legacy unfiltered baselines.
                    </CardDescription>
                  </div>
                </CardHeader>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-black/40 text-[10px] text-muted-foreground uppercase border-b border-border font-semibold">
                      <tr>
                        <th className="p-3">Ablation Scenario</th>
                        <th className="p-3 text-center">Signals (Elig / Rej)</th>
                        <th className="p-3 text-center">Trades</th>
                        <th className="p-3 text-right">Net Profit ($)</th>
                        <th className="p-3 text-right">Profit Factor</th>
                        <th className="p-3 text-right">Expectancy</th>
                        <th className="p-3 text-right">Max Drawdown</th>
                        <th className="p-3 text-right">Win Rate</th>
                        <th className="p-3 text-right">Avg Trade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {result.ablationMatrix?.map((sc) => (
                        <tr key={sc.id} className={sc.id === "ALL_ENABLED" ? "bg-amber-500/10 font-bold" : "hover:bg-white/5"}>
                          <td className="p-3 font-sans">
                            <div className="flex items-center gap-2">
                              {sc.id === "ALL_ENABLED" && <Badge className="bg-amber-500 text-black text-[9px]">Live Bot</Badge>}
                              <span className="font-semibold text-foreground">{sc.name}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground block mt-0.5 font-normal">{sc.description}</span>
                          </td>
                          <td className="p-3 text-center font-sans text-muted-foreground">
                            <span className="text-emerald-400 font-bold">{sc.signalsEligible}</span> / <span className="text-rose-400">{sc.signalsRejected}</span>
                          </td>
                          <td className="p-3 text-center text-foreground font-bold">{sc.simulatedTrades}</td>
                          <td className={`p-3 text-right font-bold ${sc.netProfitDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {sc.netProfitDollars >= 0 ? "+" : ""}${sc.netProfitDollars.toFixed(2)}
                          </td>
                          <td className="p-3 text-right text-foreground font-semibold">{sc.profitFactor.toFixed(2)}</td>
                          <td className={`p-3 text-right ${sc.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {sc.expectancyR >= 0 ? "+" : ""}{sc.expectancyR.toFixed(3)} R
                          </td>
                          <td className="p-3 text-right text-rose-400">-{sc.maxDrawdownPercent}%</td>
                          <td className="p-3 text-right text-foreground">{sc.winRate}%</td>
                          <td className={`p-3 text-right ${sc.averageTradeDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {sc.averageTradeDollars >= 0 ? "+" : ""}${sc.averageTradeDollars.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Tab 5: Fair Trailing-Stop Comparison (6 Modes) */}
            {activeTab === "VARIANTS" && (
              <div className="space-y-4">
                <Card className="border-border bg-card/60 overflow-hidden shadow-sm">
                  <CardHeader className="py-3 px-4 border-b border-border bg-black/20">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-amber-500" />
                        <span>Fair Trailing-Stop Experiment Module</span>
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground mt-0.5">
                        Evaluates 6 trailing-stop strategies on identical historical entry signals, risk allocation, and cost assumptions to isolate the true mathematical effect of exit management
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-black/40 text-[10px] text-muted-foreground uppercase border-b border-border font-semibold">
                        <tr>
                          <th className="p-3">Trailing Variant</th>
                          <th className="p-3 text-right">Net Profit ($)</th>
                          <th className="p-3 text-right">Profit Factor</th>
                          <th className="p-3 text-right">Win Rate</th>
                          <th className="p-3 text-right">Expectancy</th>
                          <th className="p-3 text-right">Max Drawdown</th>
                          <th className="p-3 text-center">W / L Trades</th>
                          <th className="p-3 text-center">Runners Unlocked</th>
                          <th className="p-3 text-right">Avg Holding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {result.variantComparison?.map((v) => (
                          <tr key={v.variant} className={v.variant === trailingStopVariant ? "bg-amber-500/10 font-bold" : "hover:bg-white/5"}>
                            <td className="p-3 font-sans">
                              <div className="flex items-center gap-2">
                                {v.variant === trailingStopVariant && <Badge className="bg-amber-500 text-black text-[9px]">Active</Badge>}
                                <span className="font-semibold text-foreground">{v.label}</span>
                              </div>
                            </td>
                            <td className={`p-3 text-right ${v.netProfitDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {v.netProfitDollars >= 0 ? "+" : ""}${v.netProfitDollars.toFixed(2)}
                            </td>
                            <td className="p-3 text-right text-foreground">{v.profitFactor.toFixed(2)}</td>
                            <td className="p-3 text-right text-foreground">{v.winRate}%</td>
                            <td className={`p-3 text-right ${v.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {v.expectancyR >= 0 ? "+" : ""}{v.expectancyR.toFixed(3)} R
                            </td>
                            <td className="p-3 text-right text-rose-400">-{v.maxDrawdownPercent}%</td>
                            <td className="p-3 text-center text-muted-foreground font-sans">
                              {v.winningTrades}W / {v.losingTrades}L
                            </td>
                            <td className="p-3 text-center text-amber-400 font-sans">{v.runnerTradesCount}</td>
                            <td className="p-3 text-right text-muted-foreground">{v.avgHoldingMinutes}m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Trailing Stop Methodology & Specification Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {result.variantComparison?.map(v => (
                    <Card key={v.variant} className="border-border bg-card/60 p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">{v.label}</span>
                        {v.variant === trailingStopVariant && <Badge className="bg-amber-500 text-black text-[9px]">Selected</Badge>}
                      </div>
                      <div className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                        <div><strong className="text-foreground">Activation: </strong>{v.activationThreshold || "Immediate upon entry"}</div>
                        <div><strong className="text-foreground">Stop Rule: </strong>{v.stopDistanceRule || "Static"}</div>
                        <div><strong className="text-foreground">Update: </strong>{v.updateFrequency || "Bar-by-bar"}</div>
                        <div><strong className="text-foreground">Exit Rule: </strong>{v.exitRule || "Stop Loss or Take Profit"}</div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 6: Dual Charts (Equity Progression + Underwater Drawdown) */}
            {activeTab === "EQUITY" && svgChart && (
              <div className="space-y-4">
                <Card className="border-border bg-card/60 p-5 overflow-hidden">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Account Equity Progression ($)</h3>
                      <p className="text-xs text-muted-foreground">Chronological balance progression across simulated historical trades</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div>
                        <span className="text-muted-foreground">Start: </span>
                        <span className="font-bold text-foreground">${Number(result.summary.initialBalance ?? 150).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">End: </span>
                        <span className={`font-bold ${(result.summary.finalBalance ?? 0) >= (result.summary.initialBalance ?? 0) ? "text-emerald-400" : "text-rose-400"}`}>
                          ${Number(result.summary.finalBalance ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full overflow-x-auto">
                    <svg viewBox={`0 0 ${svgChart.width} ${svgChart.height}`} className="w-full h-56 overflow-visible">
                      <line x1="20" y1="20" x2="780" y2="20" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4" />
                      <line x1="20" y1="120" x2="780" y2="120" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4" />
                      <line x1="20" y1="220" x2="780" y2="220" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4" />
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        points={svgChart.points}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </Card>

                <Card className="border-border bg-card/60 p-5 overflow-hidden">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Underwater Drawdown Chart (% From Peak)</h3>
                      <p className="text-xs text-muted-foreground">Historical equity dip from all-time highs during backtesting</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-muted-foreground">Maximum Drawdown:</span>
                      <span className="font-bold text-rose-400">-{result.summary.maxDrawdownPercent}% (-${result.summary.maxDrawdownDollars})</span>
                    </div>
                  </div>

                  <div className="w-full overflow-x-auto">
                    <svg viewBox={`0 0 ${svgChart.width} ${svgChart.height}`} className="w-full h-44 overflow-visible">
                      <line x1="20" y1="20" x2="780" y2="20" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.4" />
                      <line x1="20" y1="120" x2="780" y2="120" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4" />
                      <polyline
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="2.5"
                        points={svgChart.ddPoints}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </Card>
              </div>
            )}

            {/* Tab 7: Out-of-Sample (OOS) Validation */}
            {activeTab === "VALIDATION" && result.oosValidation && (
              <div className="space-y-4">
                {result.oosValidation.flagWarnings.length > 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                    <span className="font-bold flex items-center gap-1.5 text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Quantitative Quality Warnings:</span>
                    </span>
                    {result.oosValidation.flagWarnings.map((w, idx) => (
                      <p key={idx} className="text-muted-foreground ml-5">• {w}</p>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: "1. In-Sample Training (60%)", data: result.oosValidation.train, desc: "Parameter formation & development window" },
                    { label: "2. Validation Window (20%)", data: result.oosValidation.validation, desc: "Parameter verification & tuning confirmation" },
                    { label: "3. Final Out-of-Sample Test (20%)", data: result.oosValidation.test, desc: "Unseen historical market test" },
                  ].map((s, idx) => (
                    <Card key={idx} className="border-border bg-card/60 p-4 space-y-3">
                      <div>
                        <span className="text-xs font-bold text-foreground block">{s.label}</span>
                        <span className="text-[10px] text-muted-foreground">{s.desc}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="bg-black/20 p-2 rounded-lg border border-border/40">
                          <span className="text-[10px] text-muted-foreground block font-sans">Trades</span>
                          <span className="font-bold text-foreground">{s.data.tradeCount}</span>
                        </div>
                        <div className="bg-black/20 p-2 rounded-lg border border-border/40">
                          <span className="text-[10px] text-muted-foreground block font-sans">Win Rate</span>
                          <span className="font-bold text-foreground">{s.data.winRate}%</span>
                        </div>
                        <div className="bg-black/20 p-2 rounded-lg border border-border/40">
                          <span className="text-[10px] text-muted-foreground block font-sans">Net Return</span>
                          <span className={`font-bold ${s.data.netProfitDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {s.data.netProfitDollars >= 0 ? "+" : ""}${s.data.netProfitDollars}
                          </span>
                        </div>
                        <div className="bg-black/20 p-2 rounded-lg border border-border/40">
                          <span className="text-[10px] text-muted-foreground block font-sans">Profit Factor</span>
                          <span className="font-bold text-foreground">{s.data.profitFactor.toFixed(2)}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 8: Monthly Results Breakdown */}
            {activeTab === "MONTHLY" && (
              <Card className="border-border bg-card/60 overflow-hidden shadow-sm space-y-3">
                <CardHeader className="py-3 px-4 border-b border-border bg-black/20">
                  <CardTitle className="text-xs font-bold text-foreground">
                    Monthly Performance Breakdown ({result.monthlyBreakdown?.length || 0} Months)
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-black/40 text-[10px] text-muted-foreground uppercase border-b border-border font-semibold">
                      <tr>
                        <th className="p-3">Month</th>
                        <th className="p-3 text-center">Trades</th>
                        <th className="p-3 text-center">Wins / Losses</th>
                        <th className="p-3 text-right">Win Rate</th>
                        <th className="p-3 text-right">Gross Profit ($)</th>
                        <th className="p-3 text-right">Gross Loss ($)</th>
                        <th className="p-3 text-right">Net Profit ($)</th>
                        <th className="p-3 text-right">Profit Factor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {result.monthlyBreakdown?.map((m) => (
                        <tr key={m.month} className="hover:bg-white/5">
                          <td className="p-3 font-sans font-bold text-foreground">{m.month}</td>
                          <td className="p-3 text-center font-bold text-foreground">{m.totalTrades}</td>
                          <td className="p-3 text-center text-muted-foreground font-sans">
                            {m.wins}W / {m.losses}L
                          </td>
                          <td className="p-3 text-right text-foreground">{m.winRate}%</td>
                          <td className="p-3 text-right text-emerald-400">+${m.grossProfit.toFixed(2)}</td>
                          <td className="p-3 text-right text-rose-400">-${m.grossLoss.toFixed(2)}</td>
                          <td className={`p-3 text-right font-bold ${m.netPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {m.netPnlDollars >= 0 ? "+" : ""}${m.netPnlDollars.toFixed(2)}
                          </td>
                          <td className="p-3 text-right text-foreground font-bold">{m.profitFactor.toFixed(2)}</td>
                        </tr>
                      )) || (
                        <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No monthly data available</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Tab 9: Spread & Execution Cost Model */}
            {activeTab === "COST_MODEL" && (
              <Card className="border-border bg-card/60 p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-500" />
                    <span>Spread, Slippage & Contract Specification Model</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Verification of broker contract units, price point values, bid/ask spread conversions, and execution friction assumptions for institutional spot gold trading.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-black/20 p-3 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Symbol & Contract</span>
                    <span className="text-lg font-mono font-bold text-foreground mt-0.5 block">XAUUSD (GOLD)</span>
                    <span className="text-[10px] text-muted-foreground">1 Standard Lot = 100 Troy Oz</span>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Point Value ($)</span>
                    <span className="text-lg font-mono font-bold text-foreground mt-0.5 block">$100.00 / Lot</span>
                    <span className="text-[10px] text-muted-foreground">$1.00 move per oz = $100 per lot</span>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Backtest Spread</span>
                    <span className="text-lg font-mono font-bold text-amber-400 mt-0.5 block">0.45 points</span>
                    <span className="text-[10px] text-muted-foreground">$45.00 / lot round-trip cost</span>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Slippage & Friction</span>
                    <span className="text-lg font-mono font-bold text-foreground mt-0.5 block">0.08 points</span>
                    <span className="text-[10px] text-muted-foreground">$8.00 / lot entry latency</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-black/30 p-3.5 space-y-2 text-xs">
                  <div className="font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Cost Calculation Verification:</span>
                  </div>
                  <ul className="text-muted-foreground space-y-1 list-disc list-inside leading-relaxed text-[11px]">
                    <li><strong>Round-trip spread accounting: </strong>Long trades enter at Ask (<code className="text-amber-400">close + spread/2 + slippage</code>) and exit at Bid (<code className="text-amber-400">bidLow/bidHigh = bar - spread/2</code>). The full spread is applied exactly once across the round trip without accidental double-counting.</li>
                    <li><strong>Live Spread (1.49) vs Backtest Input (0.45): </strong>Both numbers represent USD per troy ounce. Live spread widens to 1.49 during Asian off-hours and rollover; backtest uses 0.45 reflecting liquid London/NY daytime market hours.</li>
                    <li><strong>Position sizing: </strong>Risk per point is scaled by 100 oz per lot (<code className="text-amber-400">riskPerPoint / contractSize</code>).</li>
                  </ul>
                </div>
              </Card>
            )}

            {/* Tab 10: Session Breakdown */}
            {activeTab === "SESSIONS" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {result.breakdownBySession?.map((s) => (
                  <Card key={s.name} className="border-border bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>{s.name}</span>
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">{s.totalTrades} trades</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Win Rate</span>
                        <span className="font-mono font-bold text-foreground">{s.winRate}%</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Net Return</span>
                        <span className={`font-mono font-bold ${s.netPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {s.netPnlDollars >= 0 ? "+" : ""}${s.netPnlDollars}
                        </span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Profit Factor</span>
                        <span className="font-mono font-bold text-foreground">{s.profitFactor.toFixed(2)}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Expectancy</span>
                        <span className={`font-mono font-bold ${s.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {s.expectancyR >= 0 ? "+" : ""}{s.expectancyR.toFixed(2)} R
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Tab 11: Pattern Breakdown */}
            {activeTab === "PATTERNS" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {result.breakdownByPattern?.map((p) => (
                  <Card key={p.name} className="border-border bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-500" />
                        <span>{p.name}</span>
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">{p.totalTrades} trades</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Win Rate</span>
                        <span className="font-mono font-bold text-foreground">{p.winRate}%</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Net Return</span>
                        <span className={`font-mono font-bold ${p.netPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {p.netPnlDollars >= 0 ? "+" : ""}${p.netPnlDollars}
                        </span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Profit Factor</span>
                        <span className="font-mono font-bold text-foreground">{p.profitFactor.toFixed(2)}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Expectancy</span>
                        <span className={`font-mono font-bold ${p.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {p.expectancyR >= 0 ? "+" : ""}{p.expectancyR.toFixed(2)} R
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Tab 12: Historical Data Management */}
            {activeTab === "DATA_MANAGER" && (
              <Card className="border-border bg-card/60 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-500" />
                      <span>Persistent Historical Market Data Store</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Disk-backed OHLC store with atomic deduplication, gap detection, and canonical UTC timestamps
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleCsvUpload}
                      accept=".csv"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/10 dark:bg-white/5 border border-border hover:bg-black/20 text-foreground transition-all"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-500" />
                      <span>Import CSV Candles</span>
                    </button>
                    <button
                      onClick={handleSyncMetaApi}
                      disabled={isSyncingData}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black shadow-sm disabled:opacity-50 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingData ? "animate-spin" : ""}`} />
                      <span>{isSyncingData ? "Syncing..." : "Sync Fresh Candles"}</span>
                    </button>
                  </div>
                </div>

                {coverage && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-black/20 p-3 rounded-xl border border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Stored Candles</span>
                      <span className="text-lg font-mono font-bold text-foreground mt-0.5 block">{coverage.candleCount}</span>
                      <span className="text-[10px] text-muted-foreground">{coverage.symbol} · {coverage.timeframe}</span>
                    </div>

                    <div className="bg-black/20 p-3 rounded-xl border border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Data Quality</span>
                      <span className={`text-lg font-bold mt-0.5 block ${
                        coverage.dataQuality === "EXCELLENT" ? "text-emerald-400" : coverage.dataQuality === "GOOD" ? "text-amber-400" : "text-rose-400"
                      }`}>
                        {coverage.dataQuality}
                      </span>
                      <span className="text-[10px] text-muted-foreground">Detected gaps: {coverage.gapCount}</span>
                    </div>

                    <div className="bg-black/20 p-3 rounded-xl border border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Earliest Candle (UTC)</span>
                      <span className="text-xs font-mono font-semibold text-foreground mt-1 block">
                        {coverage.firstCandleUTC ? new Date(coverage.firstCandleUTC).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "None"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">Historical start boundary</span>
                    </div>

                    <div className="bg-black/20 p-3 rounded-xl border border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Data Freshness</span>
                      <span className="text-lg font-mono font-bold text-foreground mt-0.5 block">
                        {coverage.freshnessMinutes < 60 ? `${coverage.freshnessMinutes}m ago` : `${Math.round(coverage.freshnessMinutes / 60)}h ago`}
                      </span>
                      <span className="text-[10px] text-muted-foreground">Last updated candle</span>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Strategy Attribution Inspector Modal */}
            {selectedTrade && (
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">Strategy Attribution — {selectedTrade.id}</span>
                      <Badge className={selectedTrade.direction === "LONG" ? "bg-emerald-500 text-black text-[10px]" : "bg-rose-500 text-white text-[10px]"}>
                        {selectedTrade.direction}
                      </Badge>
                    </div>
                    <button
                      onClick={() => setSelectedTrade(null)}
                      className="w-7 h-7 rounded-lg bg-black/20 hover:bg-black/40 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-black/20 border border-border space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Primary Strategy</span>
                      <div className="font-bold text-foreground text-sm flex items-center justify-between">
                        <span>{selectedTrade.strategyName}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{selectedTrade.strategyVersion || "v2.4.0"}</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">ID: {selectedTrade.strategyId || "PRIMARY"}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                      <div className="bg-black/20 p-2.5 rounded-lg border border-border">
                        <span className="text-[10px] text-muted-foreground block font-sans">Entry Price</span>
                        <span className="font-bold text-foreground">{formatPrice(selectedTrade.entryPrice)}</span>
                      </div>
                      <div className="bg-black/20 p-2.5 rounded-lg border border-border">
                        <span className="text-[10px] text-muted-foreground block font-sans">Stop Loss</span>
                        <span className="font-bold text-rose-400">{formatPrice(selectedTrade.stopLoss)}</span>
                      </div>
                      <div className="bg-black/20 p-2.5 rounded-lg border border-border">
                        <span className="text-[10px] text-muted-foreground block font-sans">Take Profit</span>
                        <span className="font-bold text-emerald-400">{formatPrice(selectedTrade.takeProfit)}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="font-bold text-foreground text-[11px] block">Trigger Conditions:</span>
                      <div className="p-2.5 rounded-lg bg-black/25 border border-border/60 text-[11px] font-mono space-y-1 text-muted-foreground">
                        {selectedTrade.conditionsTriggered?.map((cond, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-foreground">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{cond}</span>
                          </div>
                        )) || <div>{selectedTrade.pattern}</div>}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="font-bold text-foreground text-[11px] block">Contributing Internal Strategies:</span>
                      <div className="p-2.5 rounded-lg bg-black/25 border border-border/60 space-y-1.5 text-[11px]">
                        {selectedTrade.contributingStrategies?.map((c, i) => (
                          <div key={i} className="flex items-start justify-between gap-2 border-b border-white/5 pb-1 last:border-none">
                            <div>
                              <strong className="text-foreground block">{c.strategyName}</strong>
                              <span className="text-muted-foreground text-[10px]">{c.reason}</span>
                            </div>
                            <span className="font-mono text-amber-400 font-bold shrink-0">{c.confidence}%</span>
                          </div>
                        )) || <span className="text-muted-foreground">Single engine signal</span>}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="font-bold text-foreground text-[11px] block">Active Filters Passed:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {selectedTrade.filtersPassed?.map((f, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            ✓ {f}
                          </Badge>
                        )) || <span className="text-muted-foreground">None</span>}
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground font-mono">
                      <span>Source Candle: {new Date(selectedTrade.entryTime).toUTCString().slice(5, 22)}</span>
                      <span className={`font-bold ${selectedTrade.outcome === "WIN" ? "text-emerald-400" : "text-rose-400"}`}>
                        PnL: {selectedTrade.pnlPoints >= 0 ? "+" : ""}{selectedTrade.pnlPoints} pts (${selectedTrade.pnlDollars})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mandatory Regulatory Warning Banner */}
            <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-center text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">⚠️ Quantitative Backtesting Notice: </span>
              Simulated historical performance is for testing and statistical evaluation purposes only. Past results do not guarantee future profitability in live markets. Live execution is subject to broker spread variations, slippage, and latency.
            </div>
          </div>
        )}

        {!result && !isLoading && (
          <div className="text-center py-16 px-4 border border-dashed border-border rounded-2xl bg-card/30">
            <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-base font-bold text-foreground">No Backtest Executed Yet</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-5">
              Select your timeframe, candle volume, and strategy feature flags above, then click &ldquo;Run Backtest&rdquo; to simulate historical performance against MetaApi spot gold feed.
            </p>
            <button
              onClick={() => executeBacktest()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black shadow-md transition-all active:scale-95"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Run Quick 1,000-Candle Backtest</span>
            </button>
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}
