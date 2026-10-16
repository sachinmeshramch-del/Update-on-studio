import { useState, useMemo } from "react";
import { Link } from "wouter";
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
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

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

interface EquityCurvePoint {
  time: string;
  tradeIndex: number;
  balance: number;
  equity: number;
  drawdownDollars: number;
  drawdownPercent: number;
}

export default function BacktestPage() {
  const [timeframe, setTimeframe] = useState<string>("5m");
  const [candleCount, setCandleCount] = useState<number>(1000);
  const [initialBalance, setInitialBalance] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [spread, setSpread] = useState<number>(0.45);

  // Feature Flags
  const [featureStructuralStop, setFeatureStructuralStop] = useState<boolean>(true);
  const [featureEntryConfirmation, setFeatureEntryConfirmation] = useState<boolean>(true);
  const [featureContextPatternFilter, setFeatureContextPatternFilter] = useState<boolean>(true);
  const [featureSpreadGuard, setFeatureSpreadGuard] = useState<boolean>(true);
  const [featureSessionFilter, setFeatureSessionFilter] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<{
    summary: BacktestSummary;
    breakdownBySession: CategoryBreakdown[];
    breakdownByPattern: CategoryBreakdown[];
    breakdownByRegime: CategoryBreakdown[];
    equityCurve: EquityCurvePoint[];
    trades: BacktestTrade[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"EQUITY" | "SESSIONS" | "PATTERNS" | "TRADES">("EQUITY");
  const [tradeFilter, setTradeFilter] = useState<"ALL" | "WINS" | "LOSSES" | "LONG" | "SHORT">("ALL");

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
      toast.success(`Backtest complete! Simulated ${data.summary.totalTrades} trades over ${data.summary.candlesEvaluated} candles.`);
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
      toast.info("Applied Optimized Refactored Bot settings (all quantitative filters active)");
    } else {
      setFeatureStructuralStop(false);
      setFeatureEntryConfirmation(false);
      setFeatureContextPatternFilter(false);
      setFeatureSpreadGuard(false);
      setFeatureSessionFilter(false);
      toast.info("Applied Legacy Bot settings (unfiltered candle patterns & fixed ATR stops)");
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
      "TradeId,EntryTime,ExitTime,Direction,Pattern,Session,Regime,EntryPrice,StopLoss,TakeProfit,ExitPrice,PnLPoints,PnLDollars,ROutcome,Outcome,MAEPoints,MFEPoints,DurationMinutes,BalanceAfter"
    ];
    const rows = result.trades.map(t => [
      t.id, t.entryTime, t.exitTime, t.direction, `"${t.pattern}"`, t.session, t.regime,
      t.entryPrice, t.stopLoss, t.takeProfit, t.exitPrice, t.pnlPoints, t.pnlDollars,
      t.rOutcome, t.outcome, t.maePoints, t.mfePoints, t.durationMinutes, t.balanceAfter
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

  // Equity Curve SVG calculation
  const svgChart = useMemo(() => {
    if (!result?.equityCurve || result.equityCurve.length < 2) return null;
    const curve = result.equityCurve;
    const balances = curve.map(c => c.balance);
    const minBal = Math.min(...balances) * 0.98;
    const maxBal = Math.max(...balances) * 1.02;
    const range = maxBal - minBal || 1;

    const width = 800;
    const height = 240;
    const padding = 20;

    const points = curve.map((c, idx) => {
      const x = padding + (idx / (curve.length - 1)) * (width - padding * 2);
      const y = height - padding - ((c.balance - minBal) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    return { points, minBal, maxBal, width, height };
  }, [result?.equityCurve]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-grow container mx-auto px-2 sm:px-4 py-4 md:py-8 flex flex-col gap-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between gap-4">
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
                MetaApi Cloud Feed
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => applyPreset("OPTIMIZED")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all shadow-sm"
              title="Apply all verified quantitative filters"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Optimized Bot</span>
            </button>
            <button
              onClick={() => applyPreset("LEGACY")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30 hover:bg-zinc-500/25 transition-all"
              title="Test legacy bot behavior without filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Legacy Unfiltered</span>
            </button>
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
                  Simulate bar-by-bar execution on real MetaApi spot gold candles with Ask/Bid spread and dynamic risk management
                </CardDescription>
              </div>

              <button
                onClick={() => executeBacktest()}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black shadow-lg disabled:opacity-50 transition-all active:scale-95"
              >
                <Play className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : "fill-black"}`} />
                <span>{isLoading ? "Running Simulation…" : "Run Backtest"}</span>
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6 space-y-5">
            {/* Main Parameters Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                  onChange={(e) => setInitialBalance(Number(e.target.value))}
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
                    desc: "Restricts entries to 07:00-17:00 UTC (skips Asian & rollover)",
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
                    result.summary.winRate >= 35 ? "text-emerald-400" : result.summary.winRate >= 28 ? "text-amber-400" : "text-rose-400"
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
                    result.summary.netProfitDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    {result.summary.netProfitDollars >= 0 ? "+" : ""}${result.summary.netProfitDollars.toLocaleString()}
                  </span>
                </div>
                <span className={`text-[11px] font-mono ${result.summary.netProfitPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {result.summary.netProfitPercent >= 0 ? "+" : ""}{result.summary.netProfitPercent}% ({result.summary.netProfitPoints >= 0 ? "+" : ""}{result.summary.netProfitPoints} pts)
                </span>
              </Card>

              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Profit Factor</span>
                <span className={`text-2xl font-mono font-bold block mt-1 ${
                  result.summary.profitFactor >= 1.5 ? "text-emerald-400" : result.summary.profitFactor >= 1.0 ? "text-amber-400" : "text-rose-400"
                }`}>
                  {result.summary.profitFactor.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground">Gross Win / Gross Loss</span>
              </Card>

              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Expectancy</span>
                <span className={`text-2xl font-mono font-bold block mt-1 ${
                  result.summary.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}>
                  {result.summary.expectancyR >= 0 ? "+" : ""}{result.summary.expectancyR.toFixed(3)} R
                </span>
                <span className="text-[10px] text-muted-foreground">Per Trade Return</span>
              </Card>

              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Max Drawdown</span>
                <span className="text-2xl font-mono font-bold text-rose-400 block mt-1">
                  -{result.summary.maxDrawdownPercent}%
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">-${result.summary.maxDrawdownDollars.toLocaleString()}</span>
              </Card>

              <Card className="border-border bg-card/60 p-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Total Trades</span>
                <span className="text-2xl font-mono font-bold text-foreground block mt-1">
                  {result.summary.totalTrades}
                </span>
                <span className="text-[10px] text-muted-foreground">Avg duration: {result.summary.avgTradeDurationMinutes}m</span>
              </Card>
            </div>

            {/* Navigation Tabs for Views */}
            <div className="flex items-center justify-between border-b border-border pb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {[
                  { id: "EQUITY", label: "Equity Curve & Drawdown", icon: TrendingUp },
                  { id: "SESSIONS", label: "Session Performance", icon: Clock },
                  { id: "PATTERNS", label: "Pattern Breakdown", icon: Layers },
                  { id: "TRADES", label: `Trade Log (${result.trades.length})`, icon: BarChart3 },
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
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

            {/* Tab 1: Equity Curve Chart */}
            {activeTab === "EQUITY" && svgChart && (
              <Card className="border-border bg-card/60 p-5 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Account Equity Progression ($)</h3>
                    <p className="text-xs text-muted-foreground">Chronological balance growth across simulated historical trades</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground">Start: </span>
                      <span className="font-bold text-foreground">${result.summary.initialBalance.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">End: </span>
                      <span className={`font-bold ${result.summary.finalBalance >= result.summary.initialBalance ? "text-emerald-400" : "text-rose-400"}`}>
                        ${result.summary.finalBalance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full overflow-x-auto">
                  <svg viewBox={`0 0 ${svgChart.width} ${svgChart.height}`} className="w-full h-64 overflow-visible">
                    {/* Horizontal Grid lines */}
                    <line x1="20" y1="20" x2="780" y2="20" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4" />
                    <line x1="20" y1="120" x2="780" y2="120" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4" />
                    <line x1="20" y1="220" x2="780" y2="220" stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4" />

                    {/* Gradient background under line */}
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Equity Curve Polyline */}
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
            )}

            {/* Tab 2: Session Breakdown */}
            {activeTab === "SESSIONS" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {result.breakdownBySession.map(s => (
                  <Card key={s.name} className="border-border bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">{s.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {s.totalTrades} Trades
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Win Rate</span>
                        <span className={`font-mono font-bold ${s.winRate >= 30 ? "text-emerald-400" : "text-rose-400"}`}>
                          {s.winRate}% ({s.wins}W/{s.losses}L)
                        </span>
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

            {/* Tab 3: Pattern Breakdown */}
            {activeTab === "PATTERNS" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {result.breakdownByPattern.map(p => (
                  <Card key={p.name} className="border-border bg-card/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">{p.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {p.totalTrades} Trades
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/20 p-2 rounded-lg border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">Win Rate</span>
                        <span className={`font-mono font-bold ${p.winRate >= 30 ? "text-emerald-400" : "text-rose-400"}`}>
                          {p.winRate}% ({p.wins}W/{p.losses}L)
                        </span>
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

            {/* Tab 4: Trades Table */}
            {activeTab === "TRADES" && (
              <Card className="border-border bg-card/60 overflow-hidden shadow-sm">
                <CardHeader className="py-3 px-4 border-b border-border bg-black/20 flex flex-row items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">Executed Trade Journal</span>
                    <span className="text-xs text-muted-foreground font-mono">({filteredTrades.length} displayed)</span>
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
                        <th className="p-3">Setup</th>
                        <th className="p-3">Entry</th>
                        <th className="p-3">SL</th>
                        <th className="p-3">TP</th>
                        <th className="p-3">Exit</th>
                        <th className="p-3 text-right">PnL (pts)</th>
                        <th className="p-3 text-right">PnL ($)</th>
                        <th className="p-3 text-right">R</th>
                        <th className="p-3">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {filteredTrades.map(t => (
                        <tr key={t.id} className="hover:bg-white/5">
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
                          <td className="p-3 text-muted-foreground font-sans">{t.pattern}</td>
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
      </main>
    </div>
  );
}
