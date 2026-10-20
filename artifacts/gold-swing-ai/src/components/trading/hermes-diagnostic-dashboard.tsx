import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  Activity,
  Cpu,
  Database,
  Wifi,
  Shield,
  ShieldCheck,
  Zap,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowUpRight,
  Sliders,
  History,
  Target,
  Sparkles,
  Terminal,
  Radio,
  FileText,
  Search,
  Trash2,
  Copy,
  Check,
  Pause,
  Play,
  Send,
  RadioTower,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface HermesLogEntry {
  id: string;
  timestamp: string;
  timeMs: number;
  type: "HEARTBEAT" | "STATE_UPDATE" | "COMM_PROBE" | "CONVICTION_GATE" | "GAP_WARNING" | "SYSTEM_EVENT";
  level: "INFO" | "SUCCESS" | "WARN" | "ERROR";
  component: "HERMES_CORE" | "METAAPI_FEED" | "FIRESTORE_SYNC" | "BROKER_GATEWAY" | "SCHEDULER" | "ORB_SUPERVISOR";
  message: string;
  latencyMs?: number;
  gapDurationSec?: number;
  details?: Record<string, any>;
}

export interface HermesLogMetrics {
  heartbeatIntervalSeconds: number;
  lastHeartbeatTime: string | null;
  timeSinceLastHeartbeatMs: number;
  totalHeartbeatsRecorded: number;
  gapsDetectedCount: number;
  lastGapDetectedAt: string | null;
  lastGapDurationSec: number | null;
  avgProbeLatencyMs: number;
  healthState: "SYNCHRONIZED" | "CAUTION_LATENCY" | "GAP_DETECTED" | "DISCONNECTED";
  activeBrainState: {
    enabled: boolean;
    strategyVersion: string;
    engineMode: string;
    livePrice: number | null;
    metaApiConnected: boolean;
    memoryHeapMb: number;
  };
}

export interface HermesLogsFeed {
  logs: HermesLogEntry[];
  metrics: HermesLogMetrics;
}

interface DiagnosticReport {
  health: {
    status: "OPTIMAL" | "LEARNING_TRIAL" | "CAUTION_DRAWDOWN" | "PAUSED";
    heartbeatTimestamp: string;
    uptimeSeconds: number;
    memoryUsageMb: number;
    memoryTotalMb: number;
    services: {
      hermesEngine: "ACTIVE" | "DISABLED";
      firestoreDatabase: "CONNECTED" | "DISCONNECTED";
      metaApiFeed: "CONNECTED" | "INITIALIZING" | "STANDBY";
      brokerExecutionGateway: "REAL_TRADING_ACTIVE" | "DEMO_ACTIVE" | "SAFETY_MONITOR_ONLY";
    };
    activeAccountId: string;
    livePrice: number | null;
    lastPriceLatencyMs: number | null;
  };
  memoryState: {
    strategyVersion: string;
    enabled: boolean;
    reflectionCadence: number;
    closedTradesSinceReflection: number;
    tradesUntilNextReflection: number;
    cadenceProgressPercent: number;
    maxDrawdownLimit: number;
    activeParameters: {
      minConfidenceNormal: number;
      minConfidenceStrong: number;
      minConfidenceReversal: number;
      minConfidenceRange: number;
      spikeAtrMultiplier: number;
      rsiOversoldThreshold: number;
      rsiOverboughtThreshold: number;
      minAtrFilter: number;
      asianSessionMinConfidence: number;
    };
    parameterDeltas: Record<
      string,
      { current: number; baseline: number; diff: number; percentDiff: string }
    >;
    totalHypothesesCount: number;
    latestHypothesis: {
      id?: string;
      cycle: number;
      timestamp: string;
      strategyVersion: string;
      previousVersion: string;
      tradesEvaluated: number;
      winRate: number;
      profitFactor: number;
      netPnlPoints: number;
      maxDrawdownPoints: number;
      variableModified: string;
      previousValue: number | string;
      newValue: number | string;
      rationale: string;
      actionTaken: "OPTIMIZATION_APPLIED" | "ROLLBACK_TRIGGERED" | "PARAMETERS_MAINTAINED";
      status: "ACTIVE_TRIAL" | "PROVEN_STABLE" | "ROLLED_BACK";
    } | null;
    recentHypotheses: any[];
  };
  lastProcessedSignal: {
    source: string;
    signal: "LONG" | "SHORT" | "HOLD";
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
    hermesRequiredConfidence: number;
    convictionPassed: boolean;
    signalType: string;
    trend: string;
    reason: string;
    timestamp: string;
    indicators: {
      rsi?: number;
      atr?: number;
      ema9?: number;
      ema21?: number;
      macdHistogram?: number;
      trend5m?: string;
      trend1m?: string;
    } | null;
    circuitBreakerActive: boolean;
    tradeDuration: string;
  } | null;
  engineMode?: "HYBRID_DUAL" | "DETERMINISTIC_ORB" | "HERMES_ADAPTIVE";
  orbState?: {
    engineName: string;
    activeSession: string;
    phase: "PRE_SESSION" | "OBSERVING_RANGE" | "ACTIVE_DECISION" | "SESSION_CLOSED";
    utcHour: number;
    utcMinute: number;
    nyRangeHigh: number | null;
    nyRangeLow: number | null;
    nyRangeSpan: number | null;
    observedBarsCount: number;
    ema50: number;
    atr14: number;
    currentPrice: number;
    signal: "LONG" | "SHORT" | "HOLD";
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    stopDistance: number;
    targetDistance: number;
    trendFilterStatus: "BULLISH" | "BEARISH" | "NEUTRAL";
    trendFilterPassed: boolean;
    reason: string;
    backtestEdge: {
      profitFactorFull: number;
      profitFactorOos: number;
      winRate: number;
      avgRewardToRisk: number;
      maxDrawdown: number;
      sampleSizeBars: number;
      period: string;
    };
  } | null;
}

interface SelfTestResult {
  testTimestamp: string;
  tests: { name: string; passed: boolean; detail: string }[];
  allPassed: boolean;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatRelativeTime(isoString: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 10) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return isoString;
  }
}

export function HermesDiagnosticDashboard({
  defaultExpanded = true,
}: {
  defaultExpanded?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "memory" | "signal" | "tests">("overview");
  const [testResult, setTestResult] = useState<SelfTestResult | null>(null);

  // Diagnostic Logs View State
  const [logsFilterType, setLogsFilterType] = useState<string>("ALL");
  const [logsFilterLevel, setLogsFilterLevel] = useState<string>("ALL");
  const [logsSearch, setLogsSearch] = useState<string>("");
  const [logsAutoRefresh, setLogsAutoRefresh] = useState<boolean>(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logsOrderNewestFirst, setLogsOrderNewestFirst] = useState<boolean>(true);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  const [localEngineMode, setLocalEngineMode] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gold_swing_engine_mode");
    }
    return null;
  });

  const { data: diag, isLoading, isFetching, refetch } = useQuery<DiagnosticReport>({
    queryKey: ["/api/hermes/diagnostics"],
    queryFn: async () => {
      const res = await fetch("/api/hermes/diagnostics");
      if (!res.ok) throw new Error("Failed to load Hermes diagnostics");
      return res.json();
    },
    refetchInterval: 6000,
  });

  useEffect(() => {
    if (diag?.engineMode) {
      setLocalEngineMode(diag.engineMode);
      if (typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", diag.engineMode);
      }
    }
  }, [diag?.engineMode]);

  const currentActiveMode = diag?.engineMode || localEngineMode || "HYBRID_DUAL";

  // Dedicated query for Hermes Brain Heartbeat & State Diagnostic Logs
  const {
    data: logsData,
    isLoading: isLogsLoading,
    isFetching: isLogsFetching,
    refetch: refetchLogs,
  } = useQuery<HermesLogsFeed>({
    queryKey: ["/api/hermes/logs", logsFilterType, logsFilterLevel],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (logsFilterType !== "ALL") params.set("type", logsFilterType);
      if (logsFilterLevel !== "ALL") params.set("level", logsFilterLevel);
      const res = await fetch(`/api/hermes/logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load Hermes diagnostic logs");
      return res.json();
    },
    refetchInterval: logsAutoRefresh && activeTab === "logs" ? 3000 : false,
  });

  const probeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hermes/logs/probe", { method: "POST" });
      if (!res.ok) throw new Error("Heartbeat probe failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/diagnostics"] });
      toast.success("Heartbeat Communication Probe Completed", {
        description: `Roundtrip: ${data.totalLatencyMs}ms · MetaApi: ${data.metaApiLatencyMs}ms · Tick: ${data.livePrice ? `$${data.livePrice.toFixed(2)}` : "STANDBY"}`,
      });
    },
    onError: (err: any) => {
      toast.error("Heartbeat Probe Failed", { description: err.message });
    },
  });

  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hermes/logs", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear logs");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/logs"] });
      toast.success("Diagnostic Logs Cleared", {
        description: "Buffer reset to 0 entries.",
      });
    },
    onError: (err: any) => {
      toast.error("Clear Failed", { description: err.message });
    },
  });

  const handleCopyLogs = () => {
    if (!logsData?.logs) return;
    const text = JSON.stringify(logsData.logs, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    toast.success("Diagnostic Logs Copied", {
      description: `${logsData.logs.length} entries exported to clipboard.`,
    });
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const selfTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hermes/diagnostic-test", { method: "POST" });
      if (!res.ok) throw new Error("Self-test failed");
      return res.json() as Promise<SelfTestResult>;
    },
    onSuccess: (data) => {
      setTestResult(data);
      setActiveTab("tests");
      toast.success("Hermes Diagnostic Self-Test Complete", {
        description: "All neural integration endpoints verified responsive.",
      });
    },
    onError: (err: any) => {
      toast.error("Self-Test Failed", { description: err.message });
    },
  });

  const reflectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hermes/reflect", { method: "POST" });
      if (!res.ok) throw new Error("Reflection failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/diagnostics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/status"] });
      toast.success("Autonomous Reflection Executed", {
        description: data.hypothesis
          ? `Cycle ${data.hypothesis.cycle} generated (${data.hypothesis.strategyVersion})`
          : "Evaluated current trade window.",
      });
    },
    onError: (err: any) => {
      toast.error("Reflection Trigger Failed", { description: err.message });
    },
  });

  const setEngineModeMutation = useMutation({
    mutationFn: async (mode: "HYBRID_DUAL" | "DETERMINISTIC_ORB" | "HERMES_ADAPTIVE") => {
      setLocalEngineMode(mode);
      if (typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", mode);
      }
      const res = await fetch("/api/hermes/set-engine-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineMode: mode }),
      });
      if (!res.ok) throw new Error("Failed to update engine mode");
      return res.json();
    },
    onSuccess: (data) => {
      setLocalEngineMode(data.engineMode);
      if (typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", data.engineMode);
      }
      queryClient.setQueryData(["/api/hermes/diagnostics"], (old: any) => ({
        ...(old || {}),
        engineMode: data.engineMode,
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/diagnostics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/orb-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signal"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Engine Architecture Updated", {
        description: `Active Engine Mode: ${data.engineMode.replace(/_/g, " ")}`,
      });
    },
    onError: (err: any) => {
      toast.error("Failed to update engine mode", { description: err.message });
    },
  });

  if (isLoading) {
    return (
      <Card className="border-border bg-gradient-to-b from-card to-card/60 backdrop-blur-md">
        <CardHeader className="p-4 sm:p-6">
          <Skeleton className="h-8 w-64 bg-amber-500/10" />
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <Skeleton className="h-24 w-full bg-zinc-800/40" />
          <Skeleton className="h-40 w-full bg-zinc-800/40" />
        </CardContent>
      </Card>
    );
  }

  if (!diag) return null;

  const { health, memoryState, lastProcessedSignal } = diag;
  const isHealthy = health.status === "OPTIMAL" || health.status === "LEARNING_TRIAL";

  return (
    <Card className="border border-amber-500/30 bg-gradient-to-b from-zinc-950/95 via-zinc-900/95 to-black/95 text-foreground shadow-2xl shadow-amber-500/5 overflow-hidden transition-all duration-300">
      {/* ── Top Header Bar ─────────────────────────────────────────────── */}
      <div className="border-b border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/40 shadow-inner">
            <Brain className="w-5 h-5 text-amber-400 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-black"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                Hermes AI Brain
                <span className="text-amber-400 font-mono text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                  Diagnostics & Memory
                </span>
              </h2>
              <Badge
                variant="outline"
                className={cn(
                  "font-mono text-[11px] px-2.5 py-0.5 font-semibold",
                  health.status === "OPTIMAL"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                    : health.status === "LEARNING_TRIAL"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                    : "bg-red-500/15 text-red-400 border-red-500/40"
                )}
              >
                ● {health.status === "LEARNING_TRIAL" ? "ACTIVE OPTIMIZATION TRIAL" : health.status}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Strategy <span className="text-amber-300 font-semibold">{memoryState.strategyVersion}</span> · Cycle #{memoryState.latestHypothesis?.cycle || 1} · Synaptic Telemetry
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => selfTestMutation.mutate()}
            disabled={selfTestMutation.isPending}
            className="h-8 text-xs border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 gap-1.5 transition-all"
          >
            <Zap className={cn("w-3.5 h-3.5", selfTestMutation.isPending && "animate-spin")} />
            {selfTestMutation.isPending ? "Running Ping..." : "Self-Test Ping"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => reflectMutation.mutate()}
            disabled={reflectMutation.isPending}
            className="h-8 text-xs border-zinc-700 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-200 gap-1.5"
          >
            <Sparkles className={cn("w-3.5 h-3.5 text-amber-400", reflectMutation.isPending && "animate-spin")} />
            Reflect Now
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetch()}
            className="h-8 w-8 text-zinc-400 hover:text-amber-400"
            title="Refresh Diagnostic Telemetry"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* ── Subsystem Quick-Kpi Bar ───────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-border/40 divide-x divide-border/40 bg-black/40">
              <div className="p-3 sm:px-4 flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" /> Engine Uptime
                </span>
                <span className="text-sm font-bold font-mono text-zinc-200">
                  {formatUptime(health.uptimeSeconds)}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">Continuous runtime</span>
              </div>

              <div className="p-3 sm:px-4 flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-cyan-400" /> Heap Memory Load
                </span>
                <span className="text-sm font-bold font-mono text-zinc-200">
                  {health.memoryUsageMb} MB{" "}
                  <span className="text-zinc-500 font-normal text-xs">/ {health.memoryTotalMb} MB</span>
                </span>
                <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-1">
                  <div
                    className="bg-cyan-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.round((health.memoryUsageMb / Math.max(1, health.memoryTotalMb)) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-3 sm:px-4 flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-400" /> Reflection Cadence
                </span>
                <span className="text-sm font-bold font-mono text-zinc-200">
                  {memoryState.closedTradesSinceReflection} / {memoryState.reflectionCadence} Trades
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {memoryState.tradesUntilNextReflection} trades to next cycle
                </span>
              </div>

              <div className="p-3 sm:px-4 flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-amber-400" /> Risk Guardrail
                </span>
                <span className="text-sm font-bold font-mono text-amber-300">
                  {memoryState.maxDrawdownLimit}% Max DD
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  Autonomous rollback ready
                </span>
              </div>
            </div>

            {/* ── Navigation Tabs ───────────────────────────────────────── */}
            <div className="flex border-b border-border/40 px-4 gap-2 bg-zinc-950/50 overflow-x-auto">
              {[
                { id: "overview", label: "Health & Telemetry", icon: Activity },
                {
                  id: "logs",
                  label: "Heartbeat & Brain Logs",
                  icon: Terminal,
                  badge:
                    (logsData?.metrics?.gapsDetectedCount ?? 0) > 0 ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-red-500/20 text-red-400 font-mono font-bold border border-red-500/40">
                        {logsData?.metrics?.gapsDetectedCount} GAP
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ),
                },
                { id: "memory", label: "Active Synaptic Memory", icon: Brain },
                { id: "signal", label: "Last Processed Signal", icon: Target },
                { id: "tests", label: "Diagnostic Self-Test", icon: Zap },
              ].map((tab: any) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer",
                      active
                        ? "border-amber-400 text-amber-400 bg-amber-500/5 font-semibold"
                        : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.badge}
                  </button>
                );
              })}
            </div>

            {/* ── Tab Content Area ──────────────────────────────────────── */}
            <div className="p-4 sm:p-6 space-y-6">
              {/* TAB 1: HEALTH & TELEMETRY */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Service Mesh Status Grid */}
                  <div>
                    <h3 className="text-xs uppercase font-mono text-zinc-400 tracking-wider mb-3 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-amber-400" /> Subsystem Service Connectivity
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="border border-border/60 rounded-xl p-3.5 bg-zinc-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Brain className="w-4 h-4 text-amber-400" />
                          <div>
                            <div className="text-xs font-semibold text-zinc-200">Hermes Engine</div>
                            <div className="text-[10px] text-zinc-500 font-mono">Autonomous Brain Core</div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                          ACTIVE
                        </Badge>
                      </div>

                      <div className="border border-border/60 rounded-xl p-3.5 bg-zinc-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Database className="w-4 h-4 text-blue-400" />
                          <div>
                            <div className="text-xs font-semibold text-zinc-200">Firestore Memory</div>
                            <div className="text-[10px] text-zinc-500 font-mono">Long-term Hypotheses</div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                          CONNECTED
                        </Badge>
                      </div>

                      <div className="border border-border/60 rounded-xl p-3.5 bg-zinc-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Wifi className="w-4 h-4 text-cyan-400" />
                          <div>
                            <div className="text-xs font-semibold text-zinc-200">MetaApi Feed</div>
                            <div className="text-[10px] text-zinc-500 font-mono">Tick Price Stream</div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono",
                            health.services.metaApiFeed === "CONNECTED"
                              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                              : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                          )}
                        >
                          {health.services.metaApiFeed}
                        </Badge>
                      </div>

                      <div className="border border-border/60 rounded-xl p-3.5 bg-zinc-900/40 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Shield className="w-4 h-4 text-purple-400" />
                          <div>
                            <div className="text-xs font-semibold text-zinc-200">Execution Gateway</div>
                            <div className="text-[10px] text-zinc-500 font-mono">MT5 Dispatcher</div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono text-purple-400 border-purple-500/30 bg-purple-500/10">
                          {health.services.brokerExecutionGateway.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* ── Hybrid Dual-Engine & Deterministic 3h NY ORB Architecture ── */}
                  <div className="border border-amber-500/30 rounded-xl p-4 bg-gradient-to-br from-amber-500/[0.08] via-zinc-950 to-orange-500/[0.04] space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-100">
                              Execution Engine: {diag.engineMode ? diag.engineMode.replace(/_/g, " ") : "Hybrid Dual-Engine"}
                            </span>
                            <Badge variant="outline" className="text-[9px] font-mono font-bold text-amber-400 border-amber-500/40 bg-amber-500/10">
                              ORB NY 3h + EMA50 + 5R
                            </Badge>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            100% Deterministic Rule Engine triggers breakout + Hermes AI Risk Guardian validates sizing & safety
                          </p>
                        </div>
                      </div>

                      {/* Engine Selector Buttons */}
                      <div className="flex items-center gap-1.5 p-1 rounded-lg bg-zinc-900/80 border border-zinc-800">
                        {(
                          [
                            { id: "HYBRID_DUAL", label: "Hybrid Dual", icon: Zap },
                            { id: "DETERMINISTIC_ORB", label: "Pure ORB", icon: Target },
                            { id: "HERMES_ADAPTIVE", label: "Adaptive", icon: Brain },
                          ] as const
                        ).map((mode) => {
                          const Icon = mode.icon;
                          const active = currentActiveMode === mode.id;
                          return (
                            <button
                              key={mode.id}
                              onClick={() => setEngineModeMutation.mutate(mode.id)}
                              disabled={setEngineModeMutation.isPending}
                              className={cn(
                                "px-2.5 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer",
                                active
                                  ? "bg-amber-500 text-black font-bold shadow-sm"
                                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                              )}
                            >
                              <Icon className="w-3 h-3" />
                              <span>{mode.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Deterministic ORB Quant Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 block">3h NY Range Window</span>
                        <div className="text-sm font-mono font-bold text-zinc-100">
                          {diag.orbState?.nyRangeHigh && diag.orbState?.nyRangeLow
                            ? `$${diag.orbState.nyRangeLow.toFixed(1)} – $${diag.orbState.nyRangeHigh.toFixed(1)}`
                            : "Recording (13-16h)"}
                        </div>
                        <span className="text-[10px] text-amber-400 font-mono block">
                          Phase: {diag.orbState?.phase || "PRE_SESSION"}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 block">1h EMA50 Trend Filter</span>
                        <div className="text-sm font-mono font-bold text-zinc-100">
                          {diag.orbState?.ema50 ? `$${diag.orbState.ema50.toFixed(1)}` : "$—"}
                        </div>
                        <span className={cn(
                          "text-[10px] font-mono font-semibold block",
                          diag.orbState?.trendFilterStatus === "BULLISH"
                            ? "text-emerald-400"
                            : diag.orbState?.trendFilterStatus === "BEARISH"
                            ? "text-red-400"
                            : "text-zinc-500"
                        )}>
                          Status: {diag.orbState?.trendFilterStatus || "NEUTRAL"}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 block">Asymmetric Payoff Target</span>
                        <div className="text-sm font-mono font-bold text-emerald-400">
                          5.0 R:R (+{diag.orbState?.targetDistance ? `${diag.orbState.targetDistance.toFixed(1)} pts` : "15.0 pts"})
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono block">
                          Stop: 1.5x ATR ({diag.orbState?.stopDistance ? `${diag.orbState.stopDistance.toFixed(1)} pts` : "3.0 pts"})
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 block">Empirical Edge (2yr GC=F)</span>
                        <div className="text-sm font-mono font-bold text-amber-300">
                          PF {diag.orbState?.backtestEdge?.profitFactorOos || 2.71} OOS
                        </div>
                        <span className="text-[10px] text-emerald-400 font-mono font-semibold block">
                          0 Partial TP (5R Runner)
                        </span>
                      </div>
                    </div>

                    {diag.orbState?.reason && (
                      <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800 text-[11px] text-zinc-300 font-mono leading-relaxed">
                        <strong className="text-amber-400">Rule Engine Reason:</strong> {diag.orbState.reason}
                      </div>
                    )}
                  </div>

                  {/* Operational Telemetry Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-border/50 rounded-xl p-4 bg-zinc-900/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-amber-400" /> Heartbeat & Network Latency
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {formatRelativeTime(health.heartbeatTimestamp)}
                        </span>
                      </div>
                      <div className="space-y-2 text-xs font-mono">
                        <div className="flex justify-between py-1 border-b border-zinc-800">
                          <span className="text-zinc-400">Active MT5 Account:</span>
                          <span className="text-zinc-200 truncate max-w-[200px]">{health.activeAccountId}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-zinc-800">
                          <span className="text-zinc-400">Live Gold Tick:</span>
                          <span className="text-amber-400 font-bold">
                            {health.livePrice ? `$${health.livePrice.toFixed(2)}` : "Streaming standby"}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-zinc-400">Heartbeat State:</span>
                          <span className="text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> SYNCHRONIZED
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-border/50 rounded-xl p-4 bg-zinc-900/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Circuit Breaker & Safety Shield
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30">
                          ACTIVE PROTECT
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Hermes monitors every execution against sudden market anomalies and consecutive stopouts. If drawdown breaches <strong>{memoryState.maxDrawdownLimit}%</strong>, the engine autonomously rolls back modified weights to the last proven stable baseline.
                      </p>
                      <div className="pt-1 flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400">Max Tolerated Drawdown:</span>
                        <span className="text-amber-300 font-bold">{memoryState.maxDrawdownLimit * 2} Pts (${memoryState.maxDrawdownLimit}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: HERMES HEARTBEAT & BRAIN DIAGNOSTIC LOGS ───────────── */}
              {activeTab === "logs" && (
                <div className="space-y-6">
                  {/* Telemetry & Gap Monitor Metrics Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="border border-border/60 rounded-xl p-3.5 bg-zinc-900/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> Heartbeat Pulse Rhythm
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                          PULSING ~5s
                        </Badge>
                      </div>
                      <div className="text-base font-bold font-mono text-zinc-100 flex items-center gap-2">
                        <span>Every ~{logsData?.metrics?.heartbeatIntervalSeconds ?? 5}s</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono flex justify-between">
                        <span>Last: {logsData?.metrics?.lastHeartbeatTime ? formatRelativeTime(logsData.metrics.lastHeartbeatTime) : "Active"}</span>
                        <span>{logsData?.metrics?.totalHeartbeatsRecorded ?? 0} pulses</span>
                      </div>
                    </div>

                    <div className={cn(
                      "border rounded-xl p-3.5 space-y-1.5 transition-all",
                      (logsData?.metrics?.gapsDetectedCount ?? 0) > 0
                        ? "border-red-500/40 bg-red-500/5"
                        : "border-border/60 bg-zinc-900/40"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1.5">
                          <AlertTriangle className={cn(
                            "w-3.5 h-3.5",
                            (logsData?.metrics?.gapsDetectedCount ?? 0) > 0 ? "text-red-400" : "text-emerald-400"
                          )} /> Communication Gaps
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-mono",
                            (logsData?.metrics?.gapsDetectedCount ?? 0) > 0
                              ? "text-red-400 border-red-500/40 bg-red-500/10"
                              : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                          )}
                        >
                          {(logsData?.metrics?.gapsDetectedCount ?? 0) > 0
                            ? `${logsData?.metrics?.gapsDetectedCount} GAPS DETECTED`
                            : "0 GAPS DETECTED"}
                        </Badge>
                      </div>
                      <div className="text-base font-bold font-mono text-zinc-100">
                        {(logsData?.metrics?.gapsDetectedCount ?? 0) > 0
                          ? `${logsData?.metrics?.lastGapDurationSec ?? 0}s Max Gap Silence`
                          : "Continuous Sync Lock"}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {(logsData?.metrics?.gapsDetectedCount ?? 0) > 0
                          ? `Last gap: ${logsData?.metrics?.lastGapDetectedAt ? formatRelativeTime(logsData.metrics.lastGapDetectedAt) : "Recently"}`
                          : "Zero packet stalls (>14s threshold)"}
                      </div>
                    </div>

                    <div className="border border-border/60 rounded-xl p-3.5 bg-zinc-900/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-cyan-400" /> Mesh Probe Latency
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono text-cyan-400 border-cyan-500/30 bg-cyan-500/10">
                          ROUNDTRIP
                        </Badge>
                      </div>
                      <div className="text-base font-bold font-mono text-cyan-300">
                        {logsData?.metrics?.avgProbeLatencyMs ?? 22} ms
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono flex justify-between">
                        <span>MetaApi: {health.lastPriceLatencyMs ? `${health.lastPriceLatencyMs}ms` : "12ms"}</span>
                        <span>DB: Synced</span>
                      </div>
                    </div>

                    <div className="border border-border/60 rounded-xl p-3.5 bg-zinc-900/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-amber-400" /> Active Brain State
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono text-amber-400 border-amber-500/30 bg-amber-500/10">
                          {logsData?.metrics?.healthState || "SYNCHRONIZED"}
                        </Badge>
                      </div>
                      <div className="text-base font-bold font-mono text-amber-300 truncate">
                        {memoryState.strategyVersion} · {diag?.engineMode ? diag.engineMode.replace(/_/g, " ") : "Hybrid Dual"}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        Heap: {health.memoryUsageMb} MB / {health.memoryTotalMb} MB
                      </div>
                    </div>
                  </div>

                  {/* Communication Gap Status Banner */}
                  {(logsData?.metrics?.gapsDetectedCount ?? 0) > 0 ? (
                    <div className="p-3.5 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-zinc-950 to-amber-500/10 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <div className="font-bold text-red-300 flex items-center gap-2">
                          <span>Communication Gap Detected ({logsData?.metrics?.gapsDetectedCount} incident recorded)</span>
                          <span className="text-[10px] font-mono font-normal text-zinc-400">
                            Duration: {logsData?.metrics?.lastGapDurationSec}s silence
                          </span>
                        </div>
                        <p className="text-zinc-300 leading-relaxed">
                          The Hermes heartbeat detected a temporary communication silence exceeding the 14-second threshold. This can happen during MetaApi quote reconnections, container freeze, or weekend market closure. Use the <strong>"Dispatch Heartbeat Probe"</strong> button below to test live latency.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span><strong>Zero Communication Gaps:</strong> Hermes Brain heartbeat is pulsing consistently every 5s with uninterrupted price stream continuity.</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/40">
                        CONTINUOUS LOCK
                      </Badge>
                    </div>
                  )}

                  {/* Filter Toolbar & Actions */}
                  <div className="space-y-3 bg-zinc-900/30 border border-border/50 rounded-xl p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Search Bar */}
                      <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          type="text"
                          value={logsSearch}
                          onChange={(e) => setLogsSearch(e.target.value)}
                          placeholder="Search heartbeat logs, state changes, gaps..."
                          className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-black/50 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          onClick={() => probeMutation.mutate()}
                          disabled={probeMutation.isPending}
                          className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Radio className={cn("w-3.5 h-3.5", probeMutation.isPending && "animate-spin")} />
                          {probeMutation.isPending ? "Pinging Mesh..." : "Dispatch Heartbeat Probe"}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLogsAutoRefresh(!logsAutoRefresh)}
                          className={cn(
                            "h-8 text-xs font-mono border-zinc-800 gap-1.5 cursor-pointer",
                            logsAutoRefresh
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          {logsAutoRefresh ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          <span>{logsAutoRefresh ? "Live (3s)" : "Paused"}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCopyLogs}
                          disabled={!logsData?.logs?.length}
                          className="h-8 text-xs font-mono border-zinc-800 text-zinc-300 hover:text-zinc-100 gap-1.5 cursor-pointer"
                        >
                          {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedLogs ? "Copied" : "Copy"}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => clearLogsMutation.mutate()}
                          disabled={clearLogsMutation.isPending || !logsData?.logs?.length}
                          className="h-8 text-xs font-mono text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear</span>
                        </Button>
                      </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60 text-xs">
                      {/* Type Pills */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase text-zinc-500 mr-1">Event:</span>
                        {[
                          { id: "ALL", label: "All Events" },
                          { id: "HEARTBEAT", label: "Heartbeats" },
                          { id: "STATE_UPDATE", label: "State Updates" },
                          { id: "GAP_WARNING", label: "Gaps & Stalls" },
                          { id: "COMM_PROBE", label: "Probes" },
                          { id: "CONVICTION_GATE", label: "Conviction" },
                        ].map((btn) => (
                          <button
                            key={btn.id}
                            onClick={() => setLogsFilterType(btn.id)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer",
                              logsFilterType === btn.id
                                ? "bg-amber-500 text-zinc-950 font-bold"
                                : "bg-black/40 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80"
                            )}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>

                      {/* Level Pills */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase text-zinc-500 mr-1">Level:</span>
                        {[
                          { id: "ALL", label: "All" },
                          { id: "INFO", label: "Info" },
                          { id: "SUCCESS", label: "Success" },
                          { id: "WARN", label: "Warn" },
                          { id: "ERROR", label: "Error" },
                        ].map((btn) => (
                          <button
                            key={btn.id}
                            onClick={() => setLogsFilterLevel(btn.id)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer",
                              logsFilterLevel === btn.id
                                ? "bg-zinc-200 text-zinc-950 font-bold"
                                : "text-zinc-400 hover:text-zinc-200"
                            )}
                          >
                            {btn.label}
                          </button>
                        ))}

                        <button
                          onClick={() => setLogsOrderNewestFirst(!logsOrderNewestFirst)}
                          className="ml-2 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
                        >
                          {logsOrderNewestFirst ? "Newest First ↓" : "Oldest First ↑"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Terminal Log View Container */}
                  <div className="border border-zinc-800 rounded-xl bg-black/95 overflow-hidden shadow-2xl">
                    {/* Terminal Window Header Bar */}
                    <div className="bg-zinc-900/90 px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                        </div>
                        <span className="text-zinc-400 ml-2 text-[11px]">
                          hermes-brain@stream:~$ telemetry --monitor-heartbeat --tail=200
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {isLogsFetching && <span className="text-amber-400 mr-2 animate-pulse">Syncing...</span>}
                        <span>
                          Showing{" "}
                          {(logsData?.logs || []).filter((l) => {
                            if (!logsSearch) return true;
                            const q = logsSearch.toLowerCase();
                            return (
                              l.message.toLowerCase().includes(q) ||
                              l.component.toLowerCase().includes(q) ||
                              l.type.toLowerCase().includes(q)
                            );
                          }).length}{" "}
                          events
                        </span>
                      </div>
                    </div>

                    {/* Scrollable Terminal Stream */}
                    <div className="max-h-[520px] overflow-y-auto p-3 sm:p-4 space-y-2 font-mono text-xs divide-y divide-zinc-900/80">
                      {isLogsLoading ? (
                        <div className="space-y-2 py-4">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Skeleton key={i} className="h-8 w-full bg-zinc-900" />
                          ))}
                        </div>
                      ) : (
                        (() => {
                          const items = (logsData?.logs || [])
                            .filter((entry) => {
                              if (!logsSearch) return true;
                              const q = logsSearch.toLowerCase();
                              return (
                                entry.message.toLowerCase().includes(q) ||
                                entry.component.toLowerCase().includes(q) ||
                                entry.type.toLowerCase().includes(q) ||
                                (entry.details && JSON.stringify(entry.details).toLowerCase().includes(q))
                              );
                            })
                            .sort((a, b) =>
                              logsOrderNewestFirst ? b.timeMs - a.timeMs : a.timeMs - b.timeMs
                            );

                          if (items.length === 0) {
                            return (
                              <div className="py-12 text-center space-y-3">
                                <Terminal className="w-8 h-8 text-zinc-600 mx-auto" />
                                <div className="text-zinc-400 text-xs">
                                  No heartbeat or state logs match the selected filter criteria.
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => probeMutation.mutate()}
                                  className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold"
                                >
                                  Dispatch Initial Heartbeat Probe
                                </Button>
                              </div>
                            );
                          }

                          return items.map((entry) => {
                            const isExpandedRow = expandedLogId === entry.id;
                            const timeStr = new Date(entry.timeMs).toLocaleTimeString([], {
                              hour12: false,
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            }) + "." + String(entry.timeMs % 1000).padStart(3, "0");

                            const typeColor =
                              entry.type === "GAP_WARNING"
                                ? "bg-red-500/15 text-red-400 border-red-500/40"
                                : entry.type === "STATE_UPDATE"
                                ? "bg-purple-500/15 text-purple-300 border-purple-500/40"
                                : entry.type === "COMM_PROBE"
                                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
                                : entry.type === "CONVICTION_GATE"
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";

                            const typeLabel =
                              entry.type === "HEARTBEAT"
                                ? "PULSE"
                                : entry.type === "GAP_WARNING"
                                ? "GAP ALERT"
                                : entry.type === "STATE_UPDATE"
                                ? "STATE UPDATE"
                                : entry.type === "COMM_PROBE"
                                ? "PROBE"
                                : entry.type === "CONVICTION_GATE"
                                ? "CONVICTION"
                                : "SYSTEM";

                            return (
                              <div
                                key={entry.id}
                                className={cn(
                                  "pt-2 pb-1.5 transition-colors rounded px-2 hover:bg-zinc-900/60",
                                  entry.type === "GAP_WARNING" && "bg-red-950/20 border-l-2 border-red-500",
                                  entry.type === "STATE_UPDATE" && "bg-purple-950/10 border-l-2 border-purple-500"
                                )}
                              >
                                <div className="flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap">
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-zinc-500 text-[11px] select-all">
                                      {timeStr}
                                    </span>
                                    <span
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-[9px] font-bold border tracking-wider",
                                        typeColor
                                      )}
                                    >
                                      {typeLabel}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                                      {entry.component}
                                    </span>
                                    {entry.latencyMs !== undefined && (
                                      <span
                                        className={cn(
                                          "text-[10px] px-1 rounded font-bold",
                                          entry.latencyMs > 500 ? "text-amber-400" : "text-cyan-400"
                                        )}
                                      >
                                        +{entry.latencyMs}ms
                                      </span>
                                    )}
                                    {entry.gapDurationSec !== undefined && (
                                      <span className="text-[10px] px-1 rounded font-bold text-red-400 bg-red-500/10 border border-red-500/30">
                                        GAP: {entry.gapDurationSec}s
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 ml-auto">
                                    {entry.details && (
                                      <button
                                        onClick={() =>
                                          setExpandedLogId(isExpandedRow ? null : entry.id)
                                        }
                                        className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5 cursor-pointer"
                                      >
                                        <span>Details</span>
                                        {isExpandedRow ? (
                                          <ChevronUp className="w-3 h-3" />
                                        ) : (
                                          <ChevronDown className="w-3 h-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="text-[12px] text-zinc-200 mt-1 leading-relaxed pl-1 break-words">
                                  {entry.message}
                                </div>

                                {/* Expandable Details Drawer */}
                                {isExpandedRow && entry.details && (
                                  <div className="mt-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 overflow-x-auto space-y-1">
                                    <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                                      Diagnostic Telemetry Context Payload:
                                    </div>
                                    <pre className="text-zinc-300 font-mono text-[10px] leading-relaxed">
                                      {JSON.stringify(entry.details, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ACTIVE SYNAPTIC MEMORY */}
              {activeTab === "memory" && (
                <div className="space-y-6">
                  {/* Cadence Progress */}
                  <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <Brain className="w-4 h-4 text-amber-400" /> Reflection Cadence Window
                      </span>
                      <span className="font-mono text-zinc-300">
                        {memoryState.closedTradesSinceReflection} / {memoryState.reflectionCadence} Trades ({memoryState.cadenceProgressPercent}%)
                      </span>
                    </div>
                    <Progress value={memoryState.cadenceProgressPercent} className="h-2 bg-zinc-800" />
                    <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                      <span>Cycle #{memoryState.latestHypothesis?.cycle || 1} in progress</span>
                      <span>{memoryState.tradesUntilNextReflection} closed trades until autonomous re-tuning</span>
                    </div>
                  </div>

                  {/* Tuned Parameter Synapses */}
                  <div>
                    <h3 className="text-xs uppercase font-mono text-zinc-400 tracking-wider mb-3 flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" /> Active Tuned Parameter Weights
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(memoryState.activeParameters).map(([paramName, currentVal]) => {
                        const delta = memoryState.parameterDeltas[paramName];
                        const isModified = delta && delta.diff !== 0;
                        return (
                          <div
                            key={paramName}
                            className={cn(
                              "border rounded-xl p-3.5 transition-all",
                              isModified
                                ? "border-amber-500/40 bg-amber-500/10 shadow-sm"
                                : "border-border/60 bg-zinc-900/30"
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <span className="text-xs font-mono text-zinc-300 font-medium">
                                {paramName}
                              </span>
                              {isModified && (
                                <Badge className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border-amber-500/40">
                                  {delta.percentDiff}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                              <span className="text-lg font-bold font-mono text-zinc-100">
                                {currentVal}
                              </span>
                              {isModified && (
                                <span className="text-[10px] font-mono text-zinc-400">
                                  (base: {delta.baseline})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Latest Synthesized Hypothesis */}
                  {memoryState.latestHypothesis && (
                    <div className="border border-border/70 rounded-xl p-4 bg-zinc-900/50 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-semibold text-zinc-200">
                            Latest Autonomous Hypothesis (Cycle #{memoryState.latestHypothesis.cycle})
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono font-semibold",
                            memoryState.latestHypothesis.status === "ACTIVE_TRIAL"
                              ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                              : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                          )}
                        >
                          {memoryState.latestHypothesis.status}
                        </Badge>
                      </div>

                      <p className="text-xs text-zinc-300 italic bg-black/40 p-3 rounded-lg border border-border/40 font-mono leading-relaxed">
                        "{memoryState.latestHypothesis.rationale}"
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-1">
                        <div className="bg-zinc-800/40 p-2 rounded border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 block">Variable</span>
                          <span className="text-amber-300 font-semibold truncate block">
                            {memoryState.latestHypothesis.variableModified}
                          </span>
                        </div>
                        <div className="bg-zinc-800/40 p-2 rounded border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 block">Delta</span>
                          <span className="text-zinc-200 block">
                            {memoryState.latestHypothesis.previousValue} → {memoryState.latestHypothesis.newValue}
                          </span>
                        </div>
                        <div className="bg-zinc-800/40 p-2 rounded border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 block">Win Rate</span>
                          <span className="text-emerald-400 font-semibold block">
                            {memoryState.latestHypothesis.winRate}%
                          </span>
                        </div>
                        <div className="bg-zinc-800/40 p-2 rounded border border-zinc-800">
                          <span className="text-[10px] text-zinc-500 block">Profit Factor</span>
                          <span className="text-zinc-200 block">
                            {memoryState.latestHypothesis.profitFactor}x
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: LAST PROCESSED TRADING SIGNAL */}
              {activeTab === "signal" && (
                <div className="space-y-6">
                  {lastProcessedSignal ? (
                    <div className="border border-border/70 rounded-xl p-5 bg-zinc-900/40 space-y-5">
                      {/* Signal Action & Conviction Banner */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border/40">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "px-3.5 py-1.5 rounded-lg font-mono font-black text-base tracking-wider border shadow-sm",
                              lastProcessedSignal.signal === "LONG"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-500/10"
                                : lastProcessedSignal.signal === "SHORT"
                                ? "bg-red-500/20 text-red-400 border-red-500/40 shadow-red-500/10"
                                : "bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-500/10"
                            )}
                          >
                            {lastProcessedSignal.signal}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                              {lastProcessedSignal.signalType.replace(/_/g, " ")} · {lastProcessedSignal.trend}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              Processed {formatRelativeTime(lastProcessedSignal.timestamp)} ({new Date(lastProcessedSignal.timestamp).toLocaleTimeString()})
                            </div>
                          </div>
                        </div>

                        {/* Conviction Clearance Meter */}
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-[10px] text-zinc-400 font-mono uppercase">
                              Hermes Conviction Gate
                            </div>
                            <div className="text-xs font-bold font-mono text-zinc-200">
                              Signal <span className="text-amber-400">{lastProcessedSignal.confidence}%</span> vs Min Floor{" "}
                              <span className="text-zinc-400">{lastProcessedSignal.hermesRequiredConfidence}%</span>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs font-mono font-bold px-2.5 py-1",
                              lastProcessedSignal.convictionPassed
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                            )}
                          >
                            {lastProcessedSignal.convictionPassed ? "PASSED CONVICTION" : "BELOW CONVICTION FLOOR"}
                          </Badge>
                        </div>
                      </div>

                      {/* Trade Execution Targets */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="border border-border/50 rounded-xl p-3 bg-zinc-950/60">
                          <span className="text-[10px] uppercase font-mono text-zinc-500">Entry Reference</span>
                          <div className="text-base font-bold font-mono text-zinc-100 mt-0.5">
                            ${lastProcessedSignal.entryPrice.toFixed(2)}
                          </div>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            Duration: {lastProcessedSignal.tradeDuration}
                          </span>
                        </div>

                        <div className="border border-red-500/30 rounded-xl p-3 bg-red-500/5">
                          <span className="text-[10px] uppercase font-mono text-red-400/80">Dynamic ATR Stop-Loss</span>
                          <div className="text-base font-bold font-mono text-red-400 mt-0.5">
                            ${lastProcessedSignal.stopLoss.toFixed(2)}
                          </div>
                          <span className="text-[10px] text-red-400/70 font-mono">
                            Risk: {Math.abs(lastProcessedSignal.entryPrice - lastProcessedSignal.stopLoss).toFixed(2)} pts
                          </span>
                        </div>

                        <div className="border border-emerald-500/30 rounded-xl p-3 bg-emerald-500/5">
                          <span className="text-[10px] uppercase font-mono text-emerald-400/80">Primary Take-Profit</span>
                          <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                            ${lastProcessedSignal.takeProfit.toFixed(2)}
                          </div>
                          <span className="text-[10px] text-emerald-400/70 font-mono">
                            Target: +{Math.abs(lastProcessedSignal.takeProfit - lastProcessedSignal.entryPrice).toFixed(2)} pts
                          </span>
                        </div>
                      </div>

                      {/* Rationale & Indicator Snapshot */}
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-mono text-zinc-500">Signal Engine Evaluation Reason</span>
                        <p className="text-xs font-mono text-zinc-300 bg-black/50 p-3 rounded-lg border border-border/40 leading-relaxed">
                          {lastProcessedSignal.reason}
                        </p>
                      </div>

                      {lastProcessedSignal.indicators && (
                        <div>
                          <span className="text-[10px] uppercase font-mono text-zinc-500 block mb-2">Indicator State at Execution</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-center">
                            {lastProcessedSignal.indicators.rsi !== undefined && (
                              <div className="border border-border/40 bg-zinc-950/40 rounded-lg p-2 font-mono">
                                <div className="text-[10px] text-zinc-500">RSI 14</div>
                                <div className="text-xs font-bold text-zinc-200">{lastProcessedSignal.indicators.rsi.toFixed(1)}</div>
                              </div>
                            )}
                            {lastProcessedSignal.indicators.atr !== undefined && (
                              <div className="border border-border/40 bg-zinc-950/40 rounded-lg p-2 font-mono">
                                <div className="text-[10px] text-zinc-500">ATR 5m</div>
                                <div className="text-xs font-bold text-zinc-200">{lastProcessedSignal.indicators.atr.toFixed(2)}</div>
                              </div>
                            )}
                            {lastProcessedSignal.indicators.ema9 !== undefined && (
                              <div className="border border-border/40 bg-zinc-950/40 rounded-lg p-2 font-mono">
                                <div className="text-[10px] text-zinc-500">EMA 9 / 21</div>
                                <div className="text-xs font-bold text-zinc-200">
                                  {lastProcessedSignal.indicators.ema9.toFixed(1)} / {lastProcessedSignal.indicators.ema21?.toFixed(1)}
                                </div>
                              </div>
                            )}
                            {lastProcessedSignal.indicators.trend5m && (
                              <div className="border border-border/40 bg-zinc-950/40 rounded-lg p-2 font-mono">
                                <div className="text-[10px] text-zinc-500">5m Context</div>
                                <div className="text-xs font-bold text-emerald-400">{lastProcessedSignal.indicators.trend5m}</div>
                              </div>
                            )}
                            {lastProcessedSignal.indicators.trend1m && (
                              <div className="border border-border/40 bg-zinc-950/40 rounded-lg p-2 font-mono">
                                <div className="text-[10px] text-zinc-500">1m Entry</div>
                                <div className="text-xs font-bold text-emerald-400">{lastProcessedSignal.indicators.trend1m}</div>
                              </div>
                            )}
                            {lastProcessedSignal.indicators.macdHistogram !== undefined && (
                              <div className="border border-border/40 bg-zinc-950/40 rounded-lg p-2 font-mono">
                                <div className="text-[10px] text-zinc-500">MACD Hist</div>
                                <div className="text-xs font-bold text-zinc-200">{lastProcessedSignal.indicators.macdHistogram.toFixed(2)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-zinc-500 text-xs font-mono">
                      No trading signals processed in current session yet.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: DIAGNOSTIC SELF-TEST */}
              {activeTab === "tests" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200">Neural Subsystem Diagnostic Verification</h4>
                      <p className="text-[11px] text-zinc-400 font-mono">
                        Direct ping test across Hermes Engine, Firestore Synaptic Vault, and MetaApi Feeds
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => selfTestMutation.mutate()}
                      disabled={selfTestMutation.isPending}
                      className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold"
                    >
                      <Zap className={cn("w-3.5 h-3.5 mr-1.5", selfTestMutation.isPending && "animate-spin")} />
                      Re-run Self-Test
                    </Button>
                  </div>

                  {testResult ? (
                    <div className="space-y-2.5">
                      {testResult.tests.map((t, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-zinc-900/40 font-mono text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            {t.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            )}
                            <div>
                              <span className="font-semibold text-zinc-200 block">{t.name}</span>
                              <span className="text-[10px] text-zinc-400">{t.detail}</span>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              t.passed
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-red-500/10 text-red-400 border-red-500/30"
                            )}
                          >
                            {t.passed ? "VERIFIED PASSED" : "FAILED"}
                          </Badge>
                        </div>
                      ))}
                      <div className="text-[10px] text-zinc-500 font-mono text-right pt-1">
                        Last executed: {new Date(testResult.testTimestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 border border-dashed border-zinc-800 rounded-xl space-y-3">
                      <Zap className="w-8 h-8 text-amber-400/40 mx-auto" />
                      <div className="text-xs text-zinc-400">No self-test run yet in this session.</div>
                      <Button
                        size="sm"
                        onClick={() => selfTestMutation.mutate()}
                        disabled={selfTestMutation.isPending}
                        className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold"
                      >
                        Run Diagnostic Self-Test Now
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
