import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Target,
  ShieldAlert,
  Flame,
  Zap,
  Award,
  Calendar,
  Layers,
  Clock,
  ArrowRight,
  Maximize2,
  CheckCircle2,
  XCircle,
  Eye,
  Activity,
  ChevronRight,
} from "lucide-react";

export interface VisualizerTrade {
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
  durationMinutes: number;
  pattern?: string;
  session?: string;
  regime?: string;
  exitReason?: string;
  balanceAfter: number;
  runnerActivated?: boolean;
  peakProfitPoints?: number;
}

export interface VisualizerEquityPoint {
  time: string;
  tradeIndex: number;
  balance: number;
  equity?: number;
  drawdownDollars?: number;
  drawdownPercent?: number;
  pnlDollars?: number;
  outcome?: "WIN" | "LOSS";
  runnerActivated?: boolean;
  trade?: VisualizerTrade;
}

interface BacktestVisualizerProps {
  initialBalance: number;
  finalBalance: number;
  trades: VisualizerTrade[];
  equityCurve: VisualizerEquityPoint[];
  summary: {
    winRate: number;
    profitFactor: number;
    netProfitDollars: number;
    maxDrawdownPercent: number;
    maxDrawdownDollars: number;
    expectancyR: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    consecutiveWins?: number;
    consecutiveLosses?: number;
    lotSize?: number;
    leverage?: number;
  };
  sessionBreakdown?: Array<{
    name: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    netPnlDollars: number;
    profitFactor: number;
  }>;
  monthlyBreakdown?: Array<{
    month: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    netPnlDollars: number;
    profitFactor: number;
  }>;
  onSelectTrade?: (trade: VisualizerTrade) => void;
}

type VisualizerTab = "EQUITY" | "REPLAY" | "DISTRIBUTION" | "INSPECTOR";
type RangeFilter = "ALL" | "LAST_20" | "LAST_50" | "MAX_DD";

export function BacktestVisualizer({
  initialBalance,
  finalBalance,
  trades,
  equityCurve,
  summary,
  sessionBreakdown,
  monthlyBreakdown,
  onSelectTrade,
}: BacktestVisualizerProps) {
  const [activeTab, setActiveTab] = useState<VisualizerTab>("EQUITY");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("ALL");
  const [showDrawdownArea, setShowDrawdownArea] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<VisualizerTrade | null>(
    trades && trades.length > 0 ? trades[0] : null
  );

  // ── Replay Mode State ──────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState<number>(1); // 0.5x, 1x, 2x, 5x, 10x
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean curve data with accurate trade references
  const fullChartData = useMemo(() => {
    if (!equityCurve || equityCurve.length === 0) {
      // Build curve from trades if equityCurve is empty
      let currentBal = initialBalance;
      let peak = initialBalance;
      const pts: VisualizerEquityPoint[] = [
        {
          time: trades[0]?.entryTime || "Start",
          tradeIndex: 0,
          balance: initialBalance,
          equity: initialBalance,
          drawdownDollars: 0,
          drawdownPercent: 0,
        },
      ];
      trades.forEach((t, i) => {
        currentBal = +(currentBal + t.pnlDollars).toFixed(2);
        peak = Math.max(peak, currentBal);
        const ddDol = +(peak - currentBal).toFixed(2);
        const ddPct = peak > 0 ? +((ddDol / peak) * 100).toFixed(1) : 0;
        pts.push({
          time: t.exitTime || `Trade ${i + 1}`,
          tradeIndex: i + 1,
          balance: currentBal,
          equity: currentBal,
          drawdownDollars: ddDol,
          drawdownPercent: ddPct,
          pnlDollars: t.pnlDollars,
          outcome: t.outcome,
          runnerActivated: t.runnerActivated,
          trade: t,
        });
      });
      return pts;
    }

    let peak = initialBalance;
    return equityCurve.map((pt, idx) => {
      const bal = pt.balance;
      peak = Math.max(peak, bal);
      const ddDol = pt.drawdownDollars ?? Math.max(0, +(peak - bal).toFixed(2));
      const ddPct =
        pt.drawdownPercent ?? (peak > 0 ? +((ddDol / peak) * 100).toFixed(1) : 0);
      const matchedTrade =
        pt.tradeIndex > 0 && trades[pt.tradeIndex - 1]
          ? trades[pt.tradeIndex - 1]
          : trades[idx] || null;

      return {
        ...pt,
        peak,
        drawdownDollars: ddDol,
        drawdownPercent: ddPct,
        trade: matchedTrade,
        pnlDollars: matchedTrade?.pnlDollars ?? 0,
        outcome: matchedTrade?.outcome,
        runnerActivated: matchedTrade?.runnerActivated,
      };
    });
  }, [equityCurve, trades, initialBalance]);

  // Max peak balance across the run
  const peakBalance = useMemo(() => {
    return fullChartData.reduce((max, p) => Math.max(max, p.balance), initialBalance);
  }, [fullChartData, initialBalance]);

  // Find max drawdown point index
  const maxDdIndex = useMemo(() => {
    let maxDd = 0;
    let idx = 0;
    fullChartData.forEach((p, i) => {
      if ((p.drawdownPercent || 0) > maxDd) {
        maxDd = p.drawdownPercent || 0;
        idx = i;
      }
    });
    return idx;
  }, [fullChartData]);

  // Filtered chart data based on zoom range
  const displayChartData = useMemo(() => {
    if (activeTab === "REPLAY") {
      return fullChartData.slice(0, Math.max(1, replayIndex + 1));
    }
    if (rangeFilter === "LAST_20") {
      return fullChartData.slice(Math.max(0, fullChartData.length - 21));
    }
    if (rangeFilter === "LAST_50") {
      return fullChartData.slice(Math.max(0, fullChartData.length - 51));
    }
    if (rangeFilter === "MAX_DD") {
      const start = Math.max(0, maxDdIndex - 10);
      const end = Math.min(fullChartData.length, maxDdIndex + 15);
      return fullChartData.slice(start, end);
    }
    return fullChartData;
  }, [fullChartData, rangeFilter, activeTab, replayIndex, maxDdIndex]);

  // ── Replay Engine ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(50, Math.round(600 / replaySpeed));
      replayTimerRef.current = setInterval(() => {
        setReplayIndex((prev) => {
          if (prev >= trades.length) {
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          if (trades[next - 1]) {
            setSelectedTrade(trades[next - 1]);
          }
          return next;
        });
      }, intervalMs);
    } else if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    };
  }, [isPlaying, replaySpeed, trades]);

  // Live stats during replay
  const replayStats = useMemo(() => {
    const executedTrades = trades.slice(0, replayIndex);
    const count = executedTrades.length;
    if (count === 0) {
      return {
        balance: initialBalance,
        netProfit: 0,
        winRate: 0,
        wins: 0,
        losses: 0,
        currentTrade: null,
      };
    }
    const wins = executedTrades.filter((t) => t.outcome === "WIN").length;
    const losses = count - wins;
    const netProfit = executedTrades.reduce((acc, t) => acc + t.pnlDollars, 0);
    const balance = +(initialBalance + netProfit).toFixed(2);
    const winRate = +((wins / count) * 100).toFixed(1);
    const currentTrade = executedTrades[executedTrades.length - 1];

    return { balance, netProfit, winRate, wins, losses, currentTrade };
  }, [trades, replayIndex, initialBalance]);

  // ── PnL Distribution Buckets ─────────────────────────────────────────────
  const distributionData = useMemo(() => {
    if (!trades || trades.length === 0) return [];

    const buckets = [
      { label: "<-2.0R (Severe Loss)", min: -999, max: -2.0, count: 0, color: "#e11d48" },
      { label: "-1.0R (Stop Loss)", min: -1.2, max: -0.8, count: 0, color: "#f43f5e" },
      { label: "-0.5R (Tighter Stop)", min: -0.8, max: -0.1, count: 0, color: "#fb7185" },
      { label: "0 to +1R (Scratch/Small)", min: -0.1, max: 1.0, count: 0, color: "#34d399" },
      { label: "+1R to +2R (Core Target)", min: 1.0, max: 2.0, count: 0, color: "#10b981" },
      { label: "+2R to +3R (Expanded TP)", min: 2.0, max: 3.5, count: 0, color: "#059669" },
      { label: "+3.5R+ (Asymmetric Runners)", min: 3.5, max: 999, count: 0, color: "#eab308" },
    ];

    trades.forEach((t) => {
      const r = t.rOutcome || (t.outcome === "WIN" ? 2.5 : -1.0);
      for (const b of buckets) {
        if (r >= b.min && r < b.max) {
          b.count++;
          break;
        }
      }
    });

    return buckets.map((b) => ({
      name: b.label,
      count: b.count,
      pct: +((b.count / trades.length) * 100).toFixed(1),
      color: b.color,
    }));
  }, [trades]);

  // Overall Gain %
  const totalReturnPct = useMemo(() => {
    if (initialBalance <= 0) return 0;
    return +(((finalBalance - initialBalance) / initialBalance) * 100).toFixed(1);
  }, [initialBalance, finalBalance]);

  const handleDotClick = (point: any) => {
    if (point?.trade) {
      setSelectedTrade(point.trade);
      if (onSelectTrade) onSelectTrade(point.trade);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Top Header Controls & Mode Switcher ─────────────────────────── */}
      <Card className="border-border bg-card/80 backdrop-blur-md p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Visualizer Title & Hero Highlights */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground tracking-tight">
                  Backtest Visualizer Studio
                </h2>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-amber-500/40 text-amber-400 bg-amber-500/10"
                >
                  Interactive Analytics
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Chronological equity curve, step-by-step trade replay, and quantitative distribution
              </p>
            </div>
          </div>

          {/* Quick HUD Metrics */}
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap text-xs font-mono">
            <div className="px-3 py-1.5 rounded-lg bg-black/40 border border-border">
              <span className="text-muted-foreground text-[10px] block uppercase">Final Equity</span>
              <span
                className={`font-bold text-sm ${
                  finalBalance >= initialBalance ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ${finalBalance.toLocaleString()}
                <span className="text-[10px] font-normal ml-1">
                  ({totalReturnPct >= 0 ? "+" : ""}
                  {totalReturnPct}%)
                </span>
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-black/40 border border-border">
              <span className="text-muted-foreground text-[10px] block uppercase">Max Drawdown</span>
              <span className="font-bold text-sm text-rose-400">
                -{summary.maxDrawdownPercent}%
                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                  (-${summary.maxDrawdownDollars})
                </span>
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-black/40 border border-border">
              <span className="text-muted-foreground text-[10px] block uppercase">Win Rate</span>
              <span
                className={`font-bold text-sm ${
                  summary.winRate >= 50
                    ? "text-emerald-400"
                    : summary.winRate >= 35
                    ? "text-amber-400"
                    : "text-rose-400"
                }`}
              >
                {summary.winRate}%
                <span className="text-[10px] text-muted-foreground font-normal ml-1">
                  ({summary.winningTrades}W/{summary.losingTrades}L)
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Visualizer Mode Tabs */}
        <div className="flex items-center justify-between border-t border-border/60 mt-4 pt-3 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {[
              { id: "EQUITY", label: "Equity Curve", icon: TrendingUp },
              { id: "REPLAY", label: "Step-by-Step Replay", icon: Play },
              { id: "DISTRIBUTION", label: "PnL Distribution & Streaks", icon: Layers },
              { id: "INSPECTOR", label: "Trade Inspector", icon: Eye },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as VisualizerTab);
                    if (tab.id === "REPLAY" && replayIndex === 0) {
                      setReplayIndex(1);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sub-controls based on tab */}
          {activeTab === "EQUITY" && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-border text-[11px]">
                {(
                  [
                    { id: "ALL", label: "All" },
                    { id: "LAST_50", label: "Last 50" },
                    { id: "LAST_20", label: "Last 20" },
                    { id: "MAX_DD", label: "Max DD Focus" },
                  ] as const
                ).map((rf) => (
                  <button
                    key={rf.id}
                    onClick={() => setRangeFilter(rf.id)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                      rangeFilter === rf.id
                        ? "bg-amber-500/30 text-amber-300 font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowDrawdownArea(!showDrawdownArea)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all ${
                  showDrawdownArea
                    ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                    : "bg-black/20 text-muted-foreground border-border"
                }`}
                title="Toggle underwater drawdown visualizer"
              >
                Drawdown Area
              </button>
            </div>
          )}

          {activeTab === "REPLAY" && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Speed:</span>
              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-border text-[11px] font-mono">
                {[0.5, 1, 2, 5, 10].map((s) => (
                  <button
                    key={s}
                    onClick={() => setReplaySpeed(s)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-all ${
                      replaySpeed === s
                        ? "bg-amber-500/30 text-amber-300 font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Mode 1: Interactive Equity Curve Chart ──────────────────────── */}
      {activeTab === "EQUITY" && (
        <div className="space-y-4">
          <Card className="border-border bg-card/60 p-5 overflow-hidden">
            {/* Chart Legend & Peak Indicator */}
            <div className="flex items-center justify-between mb-3 text-xs flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 font-mono">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                  <span className="text-foreground font-semibold">Account Equity ($)</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
                  <div className="w-2.5 h-0.5 bg-amber-400 border border-amber-400 border-dashed" />
                  <span>Peak High-Water Mark (${peakBalance.toLocaleString()})</span>
                </div>
                {showDrawdownArea && (
                  <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
                    <div className="w-3 h-3 rounded bg-rose-500/30 border border-rose-500/40" />
                    <span>Underwater Drawdown Area</span>
                  </div>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground italic flex items-center gap-1">
                <span>💡 Click any trade point to inspect execution details</span>
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div className="w-full h-80 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={displayChartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                  onClick={(e) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      handleDotClick(e.activePayload[0].payload);
                    }
                  }}
                >
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                      <stop offset="60%" stopColor="#10b981" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="tradeIndex"
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => `T#${val}`}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => `$${Number(val).toLocaleString()}`}
                  />
                  <Tooltip content={<CustomEquityTooltip />} />

                  {/* Peak Reference Line */}
                  <ReferenceLine
                    y={peakBalance}
                    stroke="#eab308"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                  />

                  {/* Initial Capital Baseline */}
                  <ReferenceLine
                    y={initialBalance}
                    stroke="#71717a"
                    strokeDasharray="2 2"
                    strokeOpacity={0.5}
                    label={{
                      value: `Start: $${initialBalance}`,
                      fill: "#a1a1aa",
                      fontSize: 10,
                      position: "insideBottomLeft",
                    }}
                  />

                  {/* Equity Area */}
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#equityGrad)"
                    dot={<CustomTradeDot />}
                    activeDot={{ r: 6, fill: "#34d399", stroke: "#065f46", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Sub-Chart: Dedicated Underwater Drawdown Curve */}
            {showDrawdownArea && (
              <div className="mt-6 pt-4 border-t border-border/60">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      Underwater Drawdown Depth (% From All-Time High)
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono text-rose-400 border-rose-500/30">
                      Peak Max: -{summary.maxDrawdownPercent}%
                    </Badge>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    0% = Strategy At All-Time High
                  </span>
                </div>

                <div className="w-full h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={displayChartData}
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="tradeIndex" hide />
                      <YAxis
                        domain={["auto", 0]}
                        stroke="#71717a"
                        fontSize={10}
                        tickLine={false}
                        tickFormatter={(val) => `-${Math.abs(Number(val))}%`}
                      />
                      <Tooltip
                        formatter={(val: any) => [`-${Math.abs(Number(val))}%`, "Drawdown"]}
                        contentStyle={{
                          background: "#09090b",
                          borderColor: "#3f3f46",
                          fontSize: "12px",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey={(d) => -(d.drawdownPercent || 0)}
                        stroke="#f43f5e"
                        strokeWidth={2}
                        fill="url(#drawdownGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Mode 2: Step-by-Step Backtest Replay ─────────────────────────── */}
      {activeTab === "REPLAY" && (
        <div className="space-y-4">
          <Card className="border-border bg-card/60 p-5">
            {/* Replay Control Bar */}
            <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={isPlaying ? "destructive" : "default"}
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="gap-2 font-bold px-4"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pause Replay</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Play Simulation</span>
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsPlaying(false);
                    setReplayIndex(0);
                  }}
                  title="Reset to beginning"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsPlaying(false);
                    setReplayIndex((prev) => Math.max(0, prev - 1));
                  }}
                  disabled={replayIndex <= 0}
                  title="Step Backward"
                >
                  <SkipBack className="w-4 h-4" />
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsPlaying(false);
                    setReplayIndex((prev) => Math.min(trades.length, prev + 1));
                  }}
                  disabled={replayIndex >= trades.length}
                  title="Step Forward"
                >
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>

              {/* Step Counter & Timeline Slider */}
              <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-md">
                <span className="text-xs font-mono font-bold text-amber-400 shrink-0">
                  Trade {replayIndex} of {trades.length}
                </span>
                <Slider
                  value={[replayIndex]}
                  min={0}
                  max={trades.length}
                  step={1}
                  onValueChange={(vals) => {
                    setIsPlaying(false);
                    setReplayIndex(vals[0]);
                  }}
                  className="flex-1 cursor-pointer"
                />
              </div>
            </div>

            {/* Rolling HUD: Watch Strategy Grow Point by Point */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 rounded-xl bg-black/40 border border-border/80">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  Simulated Balance
                </span>
                <span
                  className={`text-xl font-mono font-bold ${
                    replayStats.balance >= initialBalance ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  ${replayStats.balance.toLocaleString()}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono block">
                  {replayStats.netProfit >= 0 ? "+" : ""}${replayStats.netProfit.toFixed(2)} Net
                </span>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-border/80">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  Rolling Win Rate
                </span>
                <span
                  className={`text-xl font-mono font-bold ${
                    replayStats.winRate >= 50
                      ? "text-emerald-400"
                      : replayStats.winRate >= 35
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                >
                  {replayStats.winRate}%
                </span>
                <span className="text-[10px] text-muted-foreground font-mono block">
                  {replayStats.wins} Wins / {replayStats.losses} Losses
                </span>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-border/80 col-span-2">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  Last Executed Signal In Replay
                </span>
                {replayStats.currentTrade ? (
                  <div className="flex items-center justify-between mt-1 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={replayStats.currentTrade.direction === "LONG" ? "default" : "secondary"}
                        className={`text-[10px] ${
                          replayStats.currentTrade.direction === "LONG"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        }`}
                      >
                        {replayStats.currentTrade.direction}
                      </Badge>
                      <span className="text-foreground">
                        @{replayStats.currentTrade.entryPrice} → {replayStats.currentTrade.exitPrice}
                      </span>
                    </div>
                    <span
                      className={`font-bold ${
                        replayStats.currentTrade.outcome === "WIN"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {replayStats.currentTrade.pnlDollars >= 0 ? "+" : ""}$
                      {replayStats.currentTrade.pnlDollars.toFixed(2)} (
                      {replayStats.currentTrade.exitReason})
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic mt-1 block">
                    Press Play or drag slider to start backtest playback...
                  </span>
                )}
              </div>
            </div>

            {/* Dynamic Curve Drawing Point-by-Point */}
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={displayChartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                >
                  <defs>
                    <linearGradient id="replayGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="tradeIndex"
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(val) => `T#${val}`}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="#71717a"
                    fontSize={11}
                    tickFormatter={(val) => `$${Number(val).toLocaleString()}`}
                  />
                  <Tooltip content={<CustomEquityTooltip />} />
                  <ReferenceLine
                    y={initialBalance}
                    stroke="#71717a"
                    strokeDasharray="2 2"
                    strokeOpacity={0.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#replayGrad)"
                    dot={<CustomTradeDot />}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* ── Mode 3: PnL Distribution & Streak Dynamics ─────────────────── */}
      {activeTab === "DISTRIBUTION" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* PnL Return Histogram */}
          <Card className="border-border bg-card/60 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Trade Outcome Distribution (R-Multiples)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Quantifying positive expectancy: capping downside risk vs harvesting runner tails
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-400">
                Expectancy: +{summary.expectancyR}R
              </Badge>
            </div>

            <div className="w-full h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#71717a"
                    fontSize={10}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
                  <Tooltip
                    formatter={(val: any, _name: any, item: any) => [
                      `${val} trades (${item.payload.pct}%)`,
                      "Frequency",
                    ]}
                    contentStyle={{
                      background: "#09090b",
                      borderColor: "#3f3f46",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Consecutive Win/Loss Streak Ribbon & Sessions */}
          <Card className="border-border bg-card/60 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-foreground">
                  Streak Dynamics & Consecutive Sequences
                </h3>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-emerald-400 font-bold">
                    Max Win Streak: {summary.consecutiveWins || 4}
                  </span>
                  <span>•</span>
                  <span className="text-rose-400 font-bold">
                    Max Loss Streak: {summary.consecutiveLosses || 2}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Visualizing sequence clusters to inspect psychological drawdowns and recovery resilience
              </p>

              {/* Trade Sequence Ribbon */}
              <div className="space-y-2">
                <span className="text-[11px] font-mono text-muted-foreground block">
                  Chronological Outcome Stream (Hover for details):
                </span>
                <div className="flex flex-wrap gap-1 p-2 rounded-xl bg-black/40 border border-border max-h-36 overflow-y-auto">
                  {trades.map((t, idx) => (
                    <button
                      key={t.id || idx}
                      onClick={() => {
                        setSelectedTrade(t);
                        setActiveTab("INSPECTOR");
                      }}
                      title={`#${idx + 1}: ${t.direction} ${t.outcome} (${t.pnlDollars >= 0 ? "+" : ""}$${t.pnlDollars}) via ${t.exitReason}`}
                      className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold font-mono transition-transform hover:scale-125 ${
                        t.runnerActivated
                          ? "bg-amber-500 text-black shadow-sm shadow-amber-500/50"
                          : t.outcome === "WIN"
                          ? "bg-emerald-500/80 text-white"
                          : "bg-rose-500/80 text-white"
                      }`}
                    >
                      {t.runnerActivated ? "★" : t.outcome === "WIN" ? "W" : "L"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Session Performance Breakdown If Available */}
            {sessionBreakdown && sessionBreakdown.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <span className="text-[11px] font-bold text-foreground block mb-2">
                  Session Profitability Comparison:
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {sessionBreakdown.map((s) => (
                    <div
                      key={s.name}
                      className="p-2 rounded-lg bg-black/30 border border-border flex items-center justify-between"
                    >
                      <div>
                        <span className="text-muted-foreground font-semibold block text-[11px]">
                          {s.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {s.totalTrades} trades ({s.winRate}% win)
                        </span>
                      </div>
                      <span
                        className={`font-bold ${
                          s.netPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {s.netPnlDollars >= 0 ? "+" : ""}${s.netPnlDollars}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Mode 4: Interactive Trade Inspector ─────────────────────────── */}
      {(activeTab === "INSPECTOR" || selectedTrade) && selectedTrade && (
        <Card className="border-border bg-card/60 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <Badge
                className={`text-xs font-bold px-2.5 py-1 ${
                  selectedTrade.direction === "LONG"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                }`}
              >
                {selectedTrade.direction} TRADE
              </Badge>
              <h3 className="text-sm font-bold text-foreground font-mono">
                Ticket: {selectedTrade.id}
              </h3>
              {selectedTrade.runnerActivated && (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 gap-1 text-[10px]">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Asymmetric Runner Activated</span>
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-muted-foreground">Realized Net:</span>
              <span
                className={`font-bold text-base ${
                  selectedTrade.outcome === "WIN" ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {selectedTrade.pnlDollars >= 0 ? "+" : ""}${selectedTrade.pnlDollars.toFixed(2)} (
                {selectedTrade.pnlPoints >= 0 ? "+" : ""}
                {selectedTrade.pnlPoints} pts)
              </span>
            </div>
          </div>

          {/* Visual Price Scale / Execution Ladder */}
          <div className="p-4 rounded-xl bg-black/40 border border-border/80">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-3">
              Price Level Execution Map (Gold / XAUUSD)
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-border">
                <span className="text-muted-foreground text-[10px] block">Entry Price</span>
                <span className="text-foreground font-bold text-sm">
                  ${selectedTrade.entryPrice.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate">
                  {selectedTrade.entryTime}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-900 border border-border">
                <span className="text-rose-400 text-[10px] block font-semibold">Stop Loss Level</span>
                <span className="text-rose-400 font-bold text-sm">
                  ${selectedTrade.stopLoss?.toFixed(2) || "N/A"}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  Risk: {Math.abs(selectedTrade.entryPrice - (selectedTrade.stopLoss || 0)).toFixed(2)} pts
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-900 border border-border">
                <span className="text-emerald-400 text-[10px] block font-semibold">
                  Initial Target (TP)
                </span>
                <span className="text-emerald-400 font-bold text-sm">
                  ${selectedTrade.takeProfit?.toFixed(2) || "N/A"}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  Target: {Math.abs((selectedTrade.takeProfit || 0) - selectedTrade.entryPrice).toFixed(2)} pts
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-900 border border-border">
                <span className="text-amber-400 text-[10px] block font-semibold">Exit Fill</span>
                <span className="text-amber-400 font-bold text-sm">
                  ${selectedTrade.exitPrice.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate">
                  Reason: {selectedTrade.exitReason || "COMPLETED"}
                </span>
              </div>
            </div>

            {/* Progress / Excursion Bar */}
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-mono text-muted-foreground flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Holding Duration: {selectedTrade.durationMinutes} mins</span>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5" />
                <span>R-Outcome: {selectedTrade.rOutcome > 0 ? "+" : ""}{selectedTrade.rOutcome}R</span>
              </div>
              {selectedTrade.session && (
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Session: {selectedTrade.session}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Custom Tooltip for Equity Chart ──────────────────────────────────────────
function CustomEquityTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload as VisualizerEquityPoint;

  return (
    <div className="p-3 rounded-xl bg-zinc-950/95 border border-zinc-700 shadow-2xl backdrop-blur-md text-xs font-mono space-y-1.5 min-w-[180px]">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-1 text-muted-foreground">
        <span className="font-bold text-foreground">
          {data.tradeIndex === 0 ? "Initial Deposit" : `Trade #${data.tradeIndex}`}
        </span>
        <span className="text-[10px]">{data.time}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Equity Balance:</span>
        <span className="font-bold text-sm text-foreground">
          ${Number(data.balance).toLocaleString()}
        </span>
      </div>

      {data.trade && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Trade Outcome:</span>
          <span
            className={`font-bold ${
              data.trade.outcome === "WIN" ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {data.trade.pnlDollars >= 0 ? "+" : ""}${data.trade.pnlDollars.toFixed(2)} (
            {data.trade.direction})
          </span>
        </div>
      )}

      {data.drawdownPercent != null && data.drawdownPercent > 0 && (
        <div className="flex items-center justify-between text-rose-400">
          <span>From Peak:</span>
          <span className="font-bold">
            -{data.drawdownPercent}% (-${data.drawdownDollars})
          </span>
        </div>
      )}

      {data.runnerActivated && (
        <div className="pt-1 text-[10px] text-amber-400 flex items-center gap-1 font-sans font-semibold">
          <Sparkles className="w-3 h-3" />
          <span>Asymmetric Runner TP Expansion</span>
        </div>
      )}
    </div>
  );
}

// ── Custom Trade Dots for Equity Curve ───────────────────────────────────────
function CustomTradeDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload || payload.tradeIndex === 0) return null;

  const isRunner = payload.runnerActivated;
  const isWin = payload.outcome === "WIN";

  if (isRunner) {
    return (
      <svg x={cx - 6} y={cy - 6} width={12} height={12} viewBox="0 0 24 24">
        <polygon
          points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"
          fill="#eab308"
          stroke="#000"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={isWin ? "#10b981" : "#f43f5e"}
      stroke="#09090b"
      strokeWidth={1}
    />
  );
}
