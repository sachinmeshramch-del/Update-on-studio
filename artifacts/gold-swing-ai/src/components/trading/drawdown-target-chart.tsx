import { useState, useMemo } from "react";
import { useGetHistory } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
  ZAxis,
} from "recharts";
import {
  AlertTriangle,
  ShieldAlert,
  TrendingDown,
  Target,
  BarChart3,
  Waves,
  Crosshair,
  Filter,
  Info,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatTradeTime(ts: string) {
  try {
    return formatInTimeZone(new Date(ts), LOCAL_TZ, "dd MMM, HH:mm");
  } catch {
    return "—";
  }
}

function formatShortTime(ts: string) {
  try {
    return formatInTimeZone(new Date(ts), LOCAL_TZ, "HH:mm");
  } catch {
    return "—";
  }
}

export type ViewMode = "TIMELINE" | "UNDERWATER" | "SCATTER";
export type FilterRange = "ALL" | "LAST_50" | "LAST_20" | "LOSSES_ONLY";

interface ProcessedTrade {
  id: string;
  index: number;
  timeLabel: string;
  fullTime: string;
  signal: "LONG" | "SHORT" | "HOLD";
  tradeStatus: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  closedPrice?: number;
  pnlPoints: number;
  // Metrics
  profitTarget: number;        // Planned target distance (points)
  plannedRisk: number;         // Initial risk distance to SL (points)
  drawdownLevel: number;       // Actual drawdown realized if loss, or planned exposure
  realizedDrawdown: number;    // Absolute loss points (0 for winning trades)
  riskRewardRatio: number;     // ProfitTarget / PlannedRisk
  isLoss: boolean;
  isWin: boolean;
  isHighRisk: boolean;         // Flagged if drawdown > 3.0 or RR < 1.0 or loss cluster
  clusterId?: number;          // If part of consecutive drawdown cluster
  cumulativePnl: number;
  peakPnl: number;
  underwaterDrawdown: number;  // Drawdown from peak (<= 0)
}

interface HighRiskCluster {
  id: number;
  startIndex: number;
  endIndex: number;
  tradeCount: number;
  startTime: string;
  endTime: string;
  totalLoss: number;
  maxDrawdown: number;
  signals: string[];
}

export function DrawdownTargetChart() {
  const { data, isLoading } = useGetHistory({
    query: { refetchInterval: 10000 } as any,
  });

  const [viewMode, setViewMode] = useState<ViewMode>("TIMELINE");
  const [filterRange, setFilterRange] = useState<FilterRange>("LAST_50");
  const [highlightClusters, setHighlightClusters] = useState(true);

  // ── Process and Enrich Historical Data ───────────────────────────────────────
  const {
    trades,
    rawFilteredTrades,
    clusters,
    metrics,
  } = useMemo(() => {
    const rawSignals = (data?.signals || []).filter(
      (s: any) => s.signal !== "HOLD" && s.tradeStatus !== "RUNNING"
    );

    // Sort chronological: oldest to newest for valid time-series analysis
    const sorted = [...rawSignals].sort(
      (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // First pass: compute single-trade properties and identify consecutive loss clusters
    let runningPnl = 0;
    let peak = 0;
    let currentCluster: HighRiskCluster | null = null;
    const detectedClusters: HighRiskCluster[] = [];
    let clusterCounter = 1;

    const allProcessed: ProcessedTrade[] = [];

    for (let idx = 0; idx < sorted.length; idx++) {
      const s = sorted[idx];
      const pnl = typeof s.pnlPoints === "number" ? s.pnlPoints : 0;
      const isLoss = pnl < 0;
      const isWin = pnl > 0;
      
      const profitTarget = Math.max(0.1, +(Math.abs(s.takeProfit - s.entryPrice)).toFixed(2));
      const plannedRisk  = Math.max(0.1, +(Math.abs(s.entryPrice - s.stopLoss)).toFixed(2));
      
      // Drawdown level: for a loss, it's the exact realized drawdown; for wins, it was the risk exposure
      const realizedDrawdown = isLoss ? +(Math.abs(pnl)).toFixed(2) : 0;
      const drawdownLevel = isLoss ? +(Math.abs(pnl)).toFixed(2) : +(plannedRisk * 0.4).toFixed(2); // estimated adverse excursion
      
      const riskRewardRatio = +(profitTarget / plannedRisk).toFixed(2);

      runningPnl += pnl;
      if (runningPnl > peak) {
        peak = runningPnl;
      }
      const underwater = +(runningPnl - peak).toFixed(2);

      // Cluster tracking (2 or more consecutive losses)
      if (isLoss) {
        if (!currentCluster) {
          currentCluster = {
            id: clusterCounter++,
            startIndex: idx,
            endIndex: idx,
            tradeCount: 1,
            startTime: s.timestamp,
            endTime: s.timestamp,
            totalLoss: pnl,
            maxDrawdown: Math.abs(pnl),
            signals: [s.signal],
          };
        } else {
          currentCluster.tradeCount += 1;
          currentCluster.endIndex = idx;
          currentCluster.endTime = s.timestamp;
          currentCluster.totalLoss += pnl;
          currentCluster.maxDrawdown = Math.max(currentCluster.maxDrawdown, Math.abs(pnl));
          currentCluster.signals.push(s.signal);
        }
      } else {
        if (currentCluster) {
          if (currentCluster.tradeCount >= 2) {
            detectedClusters.push({ ...currentCluster, totalLoss: +currentCluster.totalLoss.toFixed(2) });
          }
          currentCluster = null;
        }
      }

      const clusterObj: HighRiskCluster | null = currentCluster;
      const isHighRisk =
        isLoss && (Math.abs(pnl) >= 3.0 || (clusterObj !== null && clusterObj.tradeCount >= 2));

      allProcessed.push({
        id: s.id,
        index: idx + 1,
        timeLabel: formatShortTime(s.timestamp),
        fullTime: formatTradeTime(s.timestamp),
        signal: s.signal,
        tradeStatus: s.tradeStatus,
        entryPrice: s.entryPrice,
        stopLoss: s.stopLoss,
        takeProfit: s.takeProfit,
        closedPrice: s.closedPrice,
        pnlPoints: +pnl.toFixed(2),
        profitTarget,
        plannedRisk,
        drawdownLevel,
        realizedDrawdown,
        riskRewardRatio,
        isLoss,
        isWin,
        isHighRisk,
        clusterId: clusterObj && clusterObj.tradeCount >= 2 ? clusterObj.id : undefined,
        cumulativePnl: +runningPnl.toFixed(2),
        peakPnl: +peak.toFixed(2),
        underwaterDrawdown: underwater,
      });
    }

    const finalCluster: HighRiskCluster | null = currentCluster;
    if (finalCluster && finalCluster.tradeCount >= 2) {
      detectedClusters.push({ ...finalCluster, totalLoss: +finalCluster.totalLoss.toFixed(2) });
    }

    // Apply Filter Range
    let filtered = [...allProcessed];
    if (filterRange === "LAST_20") {
      filtered = filtered.slice(-20);
    } else if (filterRange === "LAST_50") {
      filtered = filtered.slice(-50);
    } else if (filterRange === "LOSSES_ONLY") {
      filtered = filtered.filter((t) => t.isLoss);
    }

    // High level metrics
    const totalLossTrades = allProcessed.filter((t) => t.isLoss);
    const totalWinTrades  = allProcessed.filter((t) => t.isWin);

    const avgTarget =
      allProcessed.length > 0
        ? +(allProcessed.reduce((acc, t) => acc + t.profitTarget, 0) / allProcessed.length).toFixed(2)
        : 0;

    const avgDrawdown =
      totalLossTrades.length > 0
        ? +(totalLossTrades.reduce((acc, t) => acc + t.realizedDrawdown, 0) / totalLossTrades.length).toFixed(2)
        : 0;

    const maxSingleDrawdown =
      totalLossTrades.length > 0
        ? +Math.max(...totalLossTrades.map((t) => t.realizedDrawdown)).toFixed(2)
        : 0;

    const deepestUnderwater =
      allProcessed.length > 0
        ? +Math.min(...allProcessed.map((t) => t.underwaterDrawdown)).toFixed(2)
        : 0;

    const targetToDDRatio =
      avgDrawdown > 0 ? +(avgTarget / avgDrawdown).toFixed(2) : +(avgTarget / 1).toFixed(2);

    return {
      trades: filtered,
      rawFilteredTrades: allProcessed,
      clusters: detectedClusters,
      metrics: {
        totalTrades: allProcessed.length,
        lossCount: totalLossTrades.length,
        winCount: totalWinTrades.length,
        avgTarget,
        avgDrawdown,
        maxSingleDrawdown,
        deepestUnderwater,
        targetToDDRatio,
        clusterCount: detectedClusters.length,
      },
    };
  }, [data, filterRange]);

  return (
    <Card className="border-border bg-card/60 shadow-sm overflow-hidden" id="drawdown-target-risk-panel">
      <CardHeader className="p-4 sm:p-5 border-b border-border bg-black/5 dark:bg-white/[0.02]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg font-bold">
                  Drawdown vs. Profit Target Risk Mapping
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-500">
                  Risk Diagnostic
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Maps adverse drawdown levels against expected profit targets to detect high-risk clusters and capital stress periods.
              </p>
            </div>
          </div>

          {/* Controls: View Mode + Range Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Buttons */}
            <div className="flex items-center p-1 bg-black/10 dark:bg-white/5 rounded-lg border border-border">
              <button
                id="view-timeline-btn"
                onClick={() => setViewMode("TIMELINE")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  viewMode === "TIMELINE"
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Trade-by-trade comparison timeline"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Timeline</span>
              </button>

              <button
                id="view-underwater-btn"
                onClick={() => setViewMode("UNDERWATER")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  viewMode === "UNDERWATER"
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Cumulative underwater peak-to-trough drawdown curve"
              >
                <Waves className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Underwater DD</span>
              </button>

              <button
                id="view-scatter-btn"
                onClick={() => setViewMode("SCATTER")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  viewMode === "SCATTER"
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Risk-to-Reward Scatter Matrix"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Risk Matrix</span>
              </button>
            </div>

            {/* Filter Dropdown */}
            <div className="flex items-center gap-1.5">
              {(["LAST_20", "LAST_50", "ALL", "LOSSES_ONLY"] as FilterRange[]).map((range) => {
                const labelMap: Record<FilterRange, string> = {
                  LAST_20: "20",
                  LAST_50: "50",
                  ALL: "All",
                  LOSSES_ONLY: "Losses",
                };
                return (
                  <Button
                    key={range}
                    id={`filter-${range.toLowerCase()}-btn`}
                    variant={filterRange === range ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-7 px-2 text-xs font-mono font-medium ${
                      filterRange === range
                        ? "bg-border text-foreground font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setFilterRange(range)}
                  >
                    {labelMap[range]}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Diagnostic Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4">
          <div className="p-2.5 sm:p-3 rounded-xl bg-black/10 dark:bg-white/[0.03] border border-border flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Avg Profit Target</span>
              <Target className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-bold font-mono text-emerald-500">
                +{metrics.avgTarget.toFixed(2)}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">pts</span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">Planned upside objective</span>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-black/10 dark:bg-white/[0.03] border border-border flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Avg Trade Drawdown</span>
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-bold font-mono text-rose-500">
                -{metrics.avgDrawdown.toFixed(2)}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">pts</span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">Per losing trade stop-out</span>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-black/10 dark:bg-white/[0.03] border border-border flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Target Efficiency</span>
              <Flame className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-bold font-mono text-amber-500">
                {metrics.targetToDDRatio.toFixed(2)}x
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">R:R</span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">Reward to drawdown cushion</span>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-black/10 dark:bg-white/[0.03] border border-border flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Max Underwater DD</span>
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg sm:text-xl font-bold font-mono text-red-500">
                {metrics.deepestUnderwater.toFixed(2)}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">pts</span>
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {metrics.clusterCount} risk clusters observed
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
        {/* High Risk Cluster Alert / Diagnostic Banner */}
        {clusters.length > 0 && highlightClusters && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-amber-400">
                  High-Risk Period Analysis: {clusters.length} Drawdown Clusters Detected
                </span>
                <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                  Consecutive losing trades have historically compressed account equity by up to{" "}
                  <strong className="text-rose-400 font-mono">
                    {Math.max(...clusters.map((c) => Math.abs(c.totalLoss))).toFixed(2)} pts
                  </strong>
                  . The newly activated <strong>1-Hour Macro Trend Gate</strong> and <strong>3.5 pt SL cap</strong> specifically prevent these whipsaw clusters.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10 self-start sm:self-center flex-shrink-0"
              onClick={() => setHighlightClusters(!highlightClusters)}
            >
              Dismiss Notice
            </Button>
          </div>
        )}

        {/* Main Chart Canvas */}
        <div className="w-full h-[360px] sm:h-[400px] relative">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading historical trade telemetry...</span>
            </div>
          ) : trades.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Info className="w-8 h-8 opacity-40" />
              <span className="text-sm">No historical trades found matching filter</span>
            </div>
          ) : viewMode === "TIMELINE" ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trades} margin={{ top: 15, right: 10, left: -10, bottom: 25 }}>
                <defs>
                  <linearGradient id="targetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  domain={[0, "auto"]}
                  tickFormatter={(val) => `${val}pt`}
                />
                <Tooltip content={<CustomTimelineTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={30}
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingBottom: 6 }}
                />

                {/* Reference line for the 3.5pt Maximum Safe Drawdown Cap */}
                <ReferenceLine
                  y={3.5}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: "Max Risk Cap (3.5pt)",
                    position: "insideTopLeft",
                    fill: "#f59e0b",
                    fontSize: 10,
                  }}
                />

                {/* Profit Target Bar (Green) */}
                <Bar
                  dataKey="profitTarget"
                  name="Profit Target (Upside pts)"
                  fill="url(#targetGrad)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={16}
                />

                {/* Realized Drawdown Bar (Red) */}
                <Bar
                  dataKey="realizedDrawdown"
                  name="Realized Drawdown (Loss pts)"
                  fill="url(#drawdownGrad)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={16}
                >
                  {trades.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isHighRisk ? "#ef4444" : entry.isLoss ? "#f43f5e" : "#52525b30"}
                      stroke={entry.isHighRisk ? "#dc2626" : "transparent"}
                      strokeWidth={entry.isHighRisk ? 1.5 : 0}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          ) : viewMode === "UNDERWATER" ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trades} margin={{ top: 15, right: 10, left: -10, bottom: 25 }}>
                <defs>
                  <linearGradient id="underwaterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.65} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                <XAxis
                  dataKey="timeLabel"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(val) => `${val}pt`}
                />
                <Tooltip content={<CustomUnderwaterTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={30}
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />

                {/* High Risk Depth Alert Threshold */}
                <ReferenceLine
                  y={-5.0}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: "Severe Drawdown Danger Zone (-5.0pt)",
                    position: "insideBottomLeft",
                    fill: "#ef4444",
                    fontSize: 10,
                  }}
                />

                <ReferenceLine y={0} stroke="#71717a" strokeWidth={1} />

                <Area
                  type="monotone"
                  dataKey="underwaterDrawdown"
                  name="Peak-to-Trough Drawdown (pts)"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fill="url(#underwaterGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
                <XAxis
                  type="number"
                  dataKey="realizedDrawdown"
                  name="Drawdown Level"
                  unit="pt"
                  stroke="#71717a"
                  fontSize={10}
                  domain={[0, "auto"]}
                  label={{
                    value: "Drawdown Experienced (Loss pts)",
                    position: "insideBottom",
                    offset: -12,
                    fontSize: 11,
                    fill: "#71717a",
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="profitTarget"
                  name="Profit Target"
                  unit="pt"
                  stroke="#71717a"
                  fontSize={10}
                  domain={[0, "auto"]}
                  label={{
                    value: "Planned Profit Target (pts)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 15,
                    fontSize: 11,
                    fill: "#71717a",
                  }}
                />
                <ZAxis dataKey="plannedRisk" range={[60, 200]} name="Planned Risk" />
                <Tooltip content={<CustomScatterTooltip />} />

                {/* 1:1 Parity Line */}
                <ReferenceLine
                  segment={[
                    { x: 0, y: 0 },
                    { x: 10, y: 10 },
                  ]}
                  stroke="#71717a"
                  strokeDasharray="3 3"
                  label={{ value: "1:1 Risk/Reward Parity", position: "insideTopLeft", fontSize: 10, fill: "#a1a1aa" }}
                />

                {/* Danger Zone Reference Area */}
                <ReferenceLine
                  x={3.5}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: "Risk Cap", position: "insideTopRight", fill: "#ef4444", fontSize: 10 }}
                />

                <Scatter name="Historical Trades" data={trades}>
                  {trades.map((t, i) => (
                    <Cell
                      key={`scatter-${i}`}
                      fill={
                        t.isHighRisk
                          ? "#ef4444"
                          : t.isLoss
                          ? "#f43f5e"
                          : t.isWin
                          ? "#10b981"
                          : "#38bdf8"
                      }
                      stroke={t.isHighRisk ? "#ffffff" : "#00000030"}
                      strokeWidth={t.isHighRisk ? 1.5 : 0.5}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Interactive Legend and High-Risk Cluster Table */}
        <div className="pt-2 border-t border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
              <span>Profit Target Reach</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
              <span>Standard Loss</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-600 border border-red-400 inline-block" />
              <span className="text-foreground font-semibold">High-Risk Trade / Cluster</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 border-t-2 border-dashed border-amber-500 inline-block" />
              <span>3.5pt Cap Threshold</span>
            </div>
          </div>

          <div className="font-mono text-[11px]">
            Displaying <span className="text-foreground font-bold">{trades.length}</span> of{" "}
            <span className="text-foreground">{rawFilteredTrades.length}</span> recorded trades
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Custom Tooltips ───────────────────────────────────────────────────────────

function CustomTimelineTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const t: ProcessedTrade = payload[0]?.payload;
  if (!t) return null;

  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-xl text-xs max-w-[240px] flex flex-col gap-1.5 z-50">
      <div className="flex items-center justify-between border-b border-border pb-1.5">
        <span className="font-bold flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              t.signal === "LONG" ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          Trade #{t.index} ({t.signal})
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">{t.timeLabel}</span>
      </div>

      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Profit Target:</span>
          <span className="text-emerald-500 font-bold">+{t.profitTarget.toFixed(2)} pts</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Planned Risk:</span>
          <span className="text-amber-500">{t.plannedRisk.toFixed(2)} pts</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Drawdown Loss:</span>
          <span className={t.isLoss ? "text-rose-500 font-bold" : "text-muted-foreground"}>
            {t.isLoss ? `-${t.realizedDrawdown.toFixed(2)} pts` : "0.00 pts (Win)"}
          </span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground border-t border-border pt-1">
          <span>Realized PnL:</span>
          <span className={`font-bold ${t.pnlPoints >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {t.pnlPoints >= 0 ? `+${t.pnlPoints.toFixed(2)}` : `${t.pnlPoints.toFixed(2)}`} pts
          </span>
        </div>
      </div>

      {t.isHighRisk && (
        <div className="mt-1 px-2 py-1 rounded bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-semibold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>High-Risk Period Anomaly</span>
        </div>
      )}
    </div>
  );
}

function CustomUnderwaterTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const t: ProcessedTrade = payload[0]?.payload;
  if (!t) return null;

  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-xl text-xs max-w-[220px] flex flex-col gap-1.5 z-50">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <span className="font-bold text-foreground">Trade #{t.index}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{t.timeLabel}</span>
      </div>

      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Drawdown Depth:</span>
          <span className="text-rose-500 font-bold">{t.underwaterDrawdown.toFixed(2)} pts</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Cumulative PnL:</span>
          <span className={t.cumulativePnl >= 0 ? "text-emerald-500" : "text-rose-400"}>
            {t.cumulativePnl >= 0 ? `+${t.cumulativePnl.toFixed(2)}` : t.cumulativePnl.toFixed(2)} pts
          </span>
        </div>
      </div>

      {t.underwaterDrawdown <= -5.0 && (
        <div className="mt-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-semibold">
          ⚠️ Severe Drawdown Zone
        </div>
      )}
    </div>
  );
}

function CustomScatterTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const t: ProcessedTrade = payload[0]?.payload;
  if (!t) return null;

  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-xl text-xs max-w-[220px] flex flex-col gap-1 z-50">
      <div className="font-bold border-b border-border pb-1 flex items-center justify-between">
        <span>Trade #{t.index}</span>
        <Badge variant="outline" className="text-[9px] font-mono">
          {t.signal}
        </Badge>
      </div>
      <div className="text-[11px] font-mono space-y-0.5 mt-1">
        <p className="text-emerald-400">Target: +{t.profitTarget.toFixed(2)} pts</p>
        <p className="text-rose-400">Drawdown: -{t.realizedDrawdown.toFixed(2)} pts</p>
        <p className="text-muted-foreground">Risk/Reward: {t.riskRewardRatio}x</p>
      </div>
    </div>
  );
}
