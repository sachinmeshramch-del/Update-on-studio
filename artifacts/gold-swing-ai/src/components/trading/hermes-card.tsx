import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Brain,
  Sparkles,
  RotateCcw,
  Sliders,
  History,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  Info,
  Layers,
  Zap,
  Target,
  Shield,
  Scale,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface HermesParameters {
  minConfidenceNormal: number;
  minConfidenceStrong: number;
  minConfidenceReversal: number;
  minConfidenceRange: number;
  spikeAtrMultiplier: number;
  rsiOversoldThreshold: number;
  rsiOverboughtThreshold: number;
  minAtrFilter: number;
  asianSessionMinConfidence: number;
}

interface HermesHypothesis {
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
}

interface HermesState {
  enabled: boolean;
  strategyVersion: string;
  reflectionCadence: number;
  closedTradesSinceReflection: number;
  tradesUntilNextReflection: number;
  maxDrawdownLimit: number;
  parameters: HermesParameters;
  latestHypothesis: HermesHypothesis | null;
  totalHypothesesCount: number;
  recentHypotheses: HermesHypothesis[];
}

export function HermesCard() {
  const queryClient = useQueryClient();
  const [showLedger, setShowLedger] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cadenceInput, setCadenceInput] = useState<number | null>(null);
  const [drawdownInput, setDrawdownInput] = useState<number | null>(null);

  const { data: hermes, isLoading } = useQuery<HermesState>({
    queryKey: ["/api/hermes/status"],
    queryFn: async () => {
      const res = await fetch("/api/hermes/status");
      if (!res.ok) throw new Error("Failed to load Hermes state");
      return res.json();
    },
    refetchInterval: 8000,
  });

  const { data: orbData } = useQuery<{
    engineMode: "HYBRID_DUAL" | "DETERMINISTIC_ORB" | "HERMES_ADAPTIVE";
    orbRiskPerTrade: number;
    orbTargetMultiple: number;
    orbStopAtrMultiplier: number;
    orbAllowLondonSession: boolean;
    orbState: any;
  }>({
    queryKey: ["/api/hermes/orb-state"],
    queryFn: async () => {
      const res = await fetch("/api/hermes/orb-state");
      if (!res.ok) throw new Error("Failed to load ORB state");
      return res.json();
    },
    refetchInterval: 8000,
  });

  const setEngineModeMutation = useMutation({
    mutationFn: async (mode: "HYBRID_DUAL" | "DETERMINISTIC_ORB" | "HERMES_ADAPTIVE") => {
      const res = await fetch("/api/hermes/set-engine-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineMode: mode }),
      });
      if (!res.ok) throw new Error("Failed to update engine mode");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/orb-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signal"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Engine Mode Updated", {
        description: `Active Mode: ${data.engineMode.replace(/_/g, " ")}`,
        duration: 3000,
      });
    },
    onError: (err: any) => {
      toast.error("Failed to update engine mode", {
        description: err.message,
      });
    },
  });

  const reflectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hermes/reflect", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Reflection failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signal"] });
      toast.success("Hermes Reflection Cycle Completed", {
        description: data.hypothesis
          ? `Result: ${data.hypothesis.actionTaken.replace(/_/g, " ")} (${data.hypothesis.strategyVersion})`
          : "Evaluated recent trades. Parameters maintained within optimal bounds.",
        duration: 4000,
      });
    },
    onError: (err: any) => {
      toast.error("Reflection Error", {
        description: err.message || "Failed to trigger reflection cycle",
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hermesEnabled: enabled }),
      });
      if (!res.ok) throw new Error("Failed to update setting");
      return res.json();
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/status"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.info(`Hermes AI Brain ${saved.hermesEnabled ? "Activated" : "Deactivated"}`, {
        description: saved.hermesEnabled
          ? "Strategy will automatically self-tune parameters after every trade cadence."
          : "Parameters are locked to static values.",
      });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (payload: { hermesReflectionCadence?: number; hermesMaxDrawdownLimit?: number }) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update configuration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/status"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setShowSettings(false);
      toast.success("Hermes Configuration Saved", {
        description: "Reflection cadence and risk limits updated.",
      });
    },
    onError: (err: any) => {
      toast.error("Save Failed", { description: err.message });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hermes/reset", { method: "POST" });
      if (!res.ok) throw new Error("Failed to reset Hermes");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signal"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setShowSettings(false);
      toast.info("Hermes Reset to Factory Baseline", {
        description: "Strategy version restored to v1.0.0 and conservative default parameters re-established.",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-card/60 backdrop-blur-sm border-border">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-48 bg-black/5 dark:bg-white/5" />
          <Skeleton className="h-20 w-full bg-black/5 dark:bg-white/5 rounded-xl" />
          <Skeleton className="h-12 w-full bg-black/5 dark:bg-white/5 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!hermes) return null;

  const cadence = hermes.reflectionCadence || 5;
  const progressPct = Math.min(100, Math.round(((cadence - hermes.tradesUntilNextReflection) / cadence) * 100));

  return (
    <Card className="bg-card/75 backdrop-blur-md border-border/80 shadow-lg relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-purple-500/20 border border-amber-500/30 flex items-center justify-center shadow-inner">
              <Brain className="w-5 h-5 text-amber-500 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold tracking-tight text-foreground">
                  Hermes AI Brain
                </CardTitle>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] px-2 py-0.5 bg-amber-500/10 border-amber-500/30 text-amber-500 font-semibold"
                >
                  {hermes.strategyVersion}
                </Badge>
                {hermes.enabled ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Self-Tuning Active
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Static Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Autonomous Self-Tuning Quantitative Reflection Engine (Native Confluence Signals)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Toggle Hypothesis Ledger */}
            <button
              onClick={() => {
                setShowLedger(!showLedger);
                setShowSettings(false);
              }}
              className={cn(
                "text-xs font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer",
                showLedger
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-500"
                  : "bg-black/5 dark:bg-white/5 border-border text-muted-foreground hover:text-foreground"
              )}
              title="View Hypothesis Ledger"
            >
              <History className="w-3.5 h-3.5" />
              <span>Hypothesis Ledger</span>
              {hermes.recentHypotheses?.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                  {hermes.recentHypotheses.length}
                </span>
              )}
            </button>

            {/* Toggle Config */}
            <button
              onClick={() => {
                setShowSettings(!showSettings);
                setShowLedger(false);
              }}
              className={cn(
                "text-xs font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer",
                showSettings
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-500"
                  : "bg-black/5 dark:bg-white/5 border-border text-muted-foreground hover:text-foreground"
              )}
              title="Configure Hermes Guardrails"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Guardrails</span>
            </button>

            {/* View Full Diagnostics & Health Telemetry */}
            <Link href="/diagnostics">
              <button
                className="text-xs font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer bg-black/5 dark:bg-white/5 border-border text-muted-foreground hover:text-amber-400 hover:border-amber-500/40"
                title="View Full Diagnostics & Brain Health Telemetry"
              >
                <Activity className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Diagnostics</span>
              </button>
            </Link>

            {/* Auto-Tuning Switch */}
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">Auto-Tuning</span>
              <Switch
                checked={hermes.enabled}
                onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                disabled={toggleMutation.isPending}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* ── Reflection Cadence Progress Bar ───────────────────────────────── */}
        <div className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-border/70 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Activity className="w-3.5 h-3.5 text-amber-500" />
              Reflection Cadence:{" "}
              <strong className="text-foreground">
                {cadence - hermes.tradesUntilNextReflection} / {cadence} Closed Trades
              </strong>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground">
                {hermes.tradesUntilNextReflection === 0
                  ? "Reflecting on next closed trade"
                  : `${hermes.tradesUntilNextReflection} trade${hermes.tradesUntilNextReflection > 1 ? "s" : ""} to next cycle`}
              </span>
              <button
                onClick={() => reflectMutation.mutate()}
                disabled={reflectMutation.isPending}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer",
                  reflectMutation.isPending
                    ? "bg-amber-500/20 text-amber-400 cursor-wait animate-pulse"
                    : "bg-amber-500 hover:bg-amber-400 text-black shadow-sm"
                )}
              >
                <Sparkles className="w-3 h-3" />
                {reflectMutation.isPending ? "Reflecting..." : "Reflect Now"}
              </button>
            </div>
          </div>
          <Progress value={progressPct} className="h-1.5 bg-black/10 dark:bg-white/10" />
        </div>

        {/* ── Latest Hypothesis & Rationale ───────────────────────────────── */}
        {hermes.latestHypothesis ? (
          <div className="p-4 rounded-xl border border-border bg-gradient-to-r from-card/90 to-amber-500/[0.04] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Current Hypothesis & Reflection
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5",
                    hermes.latestHypothesis.actionTaken === "OPTIMIZATION_APPLIED"
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                      : hermes.latestHypothesis.actionTaken === "ROLLBACK_TRIGGERED"
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                      : "bg-blue-500/10 text-blue-500 border-blue-500/30"
                  )}
                >
                  {hermes.latestHypothesis.actionTaken.replace(/_/g, " ")}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] font-mono px-1.5 py-0.2",
                    hermes.latestHypothesis.status === "ACTIVE_TRIAL"
                      ? "border-amber-500/40 text-amber-500 bg-amber-500/5"
                      : hermes.latestHypothesis.status === "PROVEN_STABLE"
                      ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5"
                      : "border-zinc-500/40 text-zinc-400"
                  )}
                >
                  {hermes.latestHypothesis.status.replace(/_/g, " ")}
                </Badge>
              </div>

              <span className="text-[11px] font-mono text-muted-foreground">
                Cycle #{hermes.latestHypothesis.cycle} · {new Date(hermes.latestHypothesis.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <p className="text-xs text-foreground leading-relaxed font-medium">
              "{hermes.latestHypothesis.rationale}"
            </p>

            {hermes.latestHypothesis.variableModified !== "none" && hermes.latestHypothesis.variableModified !== "ALL_RESET" && (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-black/5 dark:bg-white/5 border border-border text-[11px] font-mono">
                <span className="text-muted-foreground">Single-Variable Mutation:</span>
                <span className="text-foreground font-semibold">{hermes.latestHypothesis.variableModified}</span>
                <span className="text-muted-foreground">{hermes.latestHypothesis.previousValue}</span>
                <ArrowRight className="w-3 h-3 text-amber-500" />
                <span className="text-emerald-500 font-bold">{hermes.latestHypothesis.newValue}</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/50 text-[11px] font-mono">
              <div>
                <span className="text-muted-foreground block text-[10px]">EVALUATED SAMPLE</span>
                <span className="font-semibold text-foreground">{hermes.latestHypothesis.tradesEvaluated} Trades</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">SAMPLE WIN RATE</span>
                <span className={cn("font-semibold", hermes.latestHypothesis.winRate >= 50 ? "text-emerald-500" : "text-amber-500")}>
                  {hermes.latestHypothesis.winRate}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">NET OUTCOME</span>
                <span className={cn("font-semibold", hermes.latestHypothesis.netPnlPoints >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {hermes.latestHypothesis.netPnlPoints > 0 ? "+" : ""}{hermes.latestHypothesis.netPnlPoints} pts
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">PEAK DRAWDOWN</span>
                <span className="font-semibold text-muted-foreground">{hermes.latestHypothesis.maxDrawdownPoints} pts</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed border-border/80 bg-black/5 dark:bg-white/5 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Hermes baseline calibrated at version <strong>{hermes.strategyVersion}</strong>. Ready to observe live trade executions.
            </span>
            <button
              onClick={() => reflectMutation.mutate()}
              className="text-amber-500 hover:text-amber-400 font-semibold underline text-[11px] cursor-pointer"
            >
              Run Initial Baseline Audit
            </button>
          </div>
        )}

        {/* ── HYBRID DUAL-ENGINE ARCHITECTURE & DETERMINISTIC ORB TELEMETRY ── */}
        <div className="p-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] via-background to-orange-500/[0.03] space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-tight text-foreground uppercase">
                    Execution Engine Architecture
                  </span>
                  <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/10 border-amber-500/40 text-amber-500">
                    {orbData?.engineMode === "HYBRID_DUAL"
                      ? "Hybrid Dual-Engine"
                      : orbData?.engineMode === "DETERMINISTIC_ORB"
                      ? "Deterministic ORB"
                      : "Hermes Adaptive"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  100% Deterministic 3h NY ORB Trigger (16:00 UTC) + Hermes AI Risk Guardian (5R Asymmetric Payoff)
                </p>
              </div>
            </div>

            {/* Quick Engine Mode Switcher */}
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-black/20 dark:bg-white/5 border border-border">
              {(
                [
                  { id: "HYBRID_DUAL", label: "Hybrid Dual", icon: Zap },
                  { id: "DETERMINISTIC_ORB", label: "Pure ORB", icon: Target },
                  { id: "HERMES_ADAPTIVE", label: "Adaptive", icon: Brain },
                ] as const
              ).map((mode) => {
                const Icon = mode.icon;
                const isSelected = (orbData?.engineMode || "HYBRID_DUAL") === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setEngineModeMutation.mutate(mode.id)}
                    disabled={setEngineModeMutation.isPending}
                    className={cn(
                      "px-2.5 py-1 rounded text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                      isSelected
                        ? "bg-amber-500 text-black shadow-sm font-bold"
                        : "text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10"
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Real-time ORB Session Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
            {/* NY 3-Hour Range */}
            <div className="p-2.5 rounded-lg bg-card/80 border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                <span>3h NY Range</span>
                <span className="font-mono text-amber-500">
                  {orbData?.orbState?.phase === "OBSERVING_RANGE"
                    ? "Recording..."
                    : orbData?.orbState?.phase === "ACTIVE_DECISION"
                    ? "Active 16:00"
                    : orbData?.orbState?.phase === "PRE_SESSION"
                    ? "Pre-NY"
                    : "Closed"}
                </span>
              </span>
              <div className="font-mono font-bold text-foreground text-sm">
                {orbData?.orbState?.nyRangeHigh && orbData?.orbState?.nyRangeLow
                  ? `$${orbData.orbState.nyRangeLow.toFixed(1)} – $${orbData.orbState.nyRangeHigh.toFixed(1)}`
                  : "$— – $—"}
              </div>
              <span className="text-[10px] text-muted-foreground block font-mono">
                Span: {orbData?.orbState?.nyRangeSpan ? `${orbData.orbState.nyRangeSpan.toFixed(1)} pts` : "Observing"}
              </span>
            </div>

            {/* 1h EMA50 Filter */}
            <div className="p-2.5 rounded-lg bg-card/80 border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                <span>1h EMA50 Filter</span>
                <span className={cn(
                  "font-mono font-bold",
                  orbData?.orbState?.trendFilterStatus === "BULLISH"
                    ? "text-emerald-500"
                    : orbData?.orbState?.trendFilterStatus === "BEARISH"
                    ? "text-red-500"
                    : "text-muted-foreground"
                )}>
                  {orbData?.orbState?.trendFilterStatus || "NEUTRAL"}
                </span>
              </span>
              <div className="font-mono font-bold text-foreground text-sm">
                {orbData?.orbState?.ema50 ? `$${orbData.orbState.ema50.toFixed(1)}` : "$—"}
              </div>
              <span className="text-[10px] text-muted-foreground block font-mono">
                Spot: ${orbData?.orbState?.currentPrice?.toFixed(1) || "—"}
              </span>
            </div>

            {/* Asymmetric 5R Target */}
            <div className="p-2.5 rounded-lg bg-card/80 border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                <span>Asymmetric Target</span>
                <span className="font-mono text-emerald-500 font-bold">5.0 R:R</span>
              </span>
              <div className="font-mono font-bold text-emerald-500 text-sm">
                +{orbData?.orbState?.targetDistance ? `${orbData.orbState.targetDistance.toFixed(1)} pts` : "15.0 pts"}
              </div>
              <span className="text-[10px] text-muted-foreground block font-mono">
                Stop: 1.5x ATR ({orbData?.orbState?.stopDistance ? `${orbData.orbState.stopDistance.toFixed(1)} pts` : "3.0 pts"})
              </span>
            </div>

            {/* Empirical Edge & Runner Discipline */}
            <div className="p-2.5 rounded-lg bg-card/80 border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                <span>Backtest Edge</span>
                <span className="font-mono text-emerald-500 font-bold">PF 2.71 OOS</span>
              </span>
              <div className="font-mono font-bold text-foreground text-sm">
                44.4% WR · 2.38 R:R
              </div>
              <span className="text-[10px] text-emerald-500 block font-mono font-semibold">
                ✓ 0 Partial TP (5R Runner)
              </span>
            </div>
          </div>

          {/* Current Trigger State Reason Banner */}
          {orbData?.orbState?.reason && (
            <div className="p-2.5 rounded-lg bg-black/25 border border-border/80 flex items-start gap-2 text-xs">
              <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                <strong className="text-foreground font-semibold">Engine Status:</strong>{" "}
                {orbData.orbState.reason}
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
              Active Calibrated Hyper-Parameters (One-Variable Tuned)
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Injected into 5m / 1m / 15m Signal Engine
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-border">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Normal Floor</span>
              <span className="text-sm font-bold font-mono text-foreground">{hermes.parameters.minConfidenceNormal}%</span>
              <span className="text-[9px] text-muted-foreground block mt-0.5">Base trend entry</span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-border">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Strong Floor</span>
              <span className="text-sm font-bold font-mono text-foreground">{hermes.parameters.minConfidenceStrong}%</span>
              <span className="text-[9px] text-muted-foreground block mt-0.5">High-conviction A+</span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-border">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Reversal Filter</span>
              <span className="text-sm font-bold font-mono text-foreground">{hermes.parameters.minConfidenceReversal}%</span>
              <span className="text-[9px] text-muted-foreground block mt-0.5">Counter-trend bar</span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-border">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Spike Shield</span>
              <span className="text-sm font-bold font-mono text-foreground">{hermes.parameters.spikeAtrMultiplier}x</span>
              <span className="text-[9px] text-muted-foreground block mt-0.5">ATR expansion guard</span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-border">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Asian Filter</span>
              <span className="text-sm font-bold font-mono text-foreground">{hermes.parameters.asianSessionMinConfidence}%</span>
              <span className="text-[9px] text-muted-foreground block mt-0.5">Low-liquidity bar</span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-border">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Range Filter</span>
              <span className="text-sm font-bold font-mono text-foreground">{hermes.parameters.minConfidenceRange}%</span>
              <span className="text-[9px] text-muted-foreground block mt-0.5">Consolidation filter</span>
            </div>
          </div>
        </div>

        {/* ── EXPANDABLE: HYPOTHESIS EVOLUTION LEDGER ───────────────────────── */}
        <AnimatePresence>
          {showLedger && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 rounded-xl bg-black/20 dark:bg-white/5 border border-amber-500/30 space-y-3 overflow-hidden text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-1.5 text-amber-500">
                  <History className="w-3.5 h-3.5" /> Hermes Hypothesis Evolution Ledger
                </span>
                <button
                  onClick={() => setShowLedger(false)}
                  className="text-muted-foreground hover:text-foreground text-[11px] cursor-pointer"
                >
                  Close
                </button>
              </div>

              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Every reflection cycle is registered in this audit ledger with its empirical hypothesis, parameter mutation, and statistical trade sample outcome.
              </p>

              {hermes.recentHypotheses && hermes.recentHypotheses.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {hermes.recentHypotheses.map((hyp, idx) => (
                    <div
                      key={hyp.id || idx}
                      className="p-3 rounded-lg bg-card/90 border border-border space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-foreground">Cycle #{hyp.cycle}</span>
                          <Badge variant="outline" className="font-mono text-[9px] px-1.5">
                            {hyp.strategyVersion}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] font-semibold px-1.5",
                              hyp.actionTaken === "OPTIMIZATION_APPLIED"
                                ? "text-emerald-500 border-emerald-500/30"
                                : hyp.actionTaken === "ROLLBACK_TRIGGERED"
                                ? "text-amber-500 border-amber-500/30"
                                : "text-blue-500 border-blue-500/30"
                            )}
                          >
                            {hyp.actionTaken.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {new Date(hyp.timestamp).toLocaleDateString()} {new Date(hyp.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground italic">
                        "{hyp.rationale}"
                      </p>

                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-1 border-t border-border/40">
                        <span>Trades: <strong className="text-foreground">{hyp.tradesEvaluated}</strong></span>
                        <span>Win Rate: <strong className="text-foreground">{hyp.winRate}%</strong></span>
                        <span>Net PnL: <strong className={hyp.netPnlPoints >= 0 ? "text-emerald-500" : "text-red-500"}>{hyp.netPnlPoints > 0 ? "+" : ""}{hyp.netPnlPoints} pts</strong></span>
                        {hyp.variableModified !== "none" && (
                          <span className="text-amber-500">{hyp.variableModified}: {hyp.previousValue} ➔ {hyp.newValue}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground text-xs font-mono">
                  No previous hypothesis cycles recorded yet.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── EXPANDABLE: HERMES CONFIGURATION & GUARDRAILS ────────────────── */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 rounded-xl bg-black/20 dark:bg-white/5 border border-border space-y-4 overflow-hidden text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-500" /> Hermes Guardrails & Optimization Settings
                </span>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-muted-foreground hover:text-foreground text-[11px] cursor-pointer"
                >
                  Close
                </button>
              </div>

              {/* Single-variable invariant callout */}
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] space-y-1">
                <span className="font-bold text-amber-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Single-Variable Invariance Law
                </span>
                <p className="text-foreground/90 leading-relaxed">
                  Hermes will never change more than ONE hyper-parameter at a time. Every adjustment is bounded by strict mathematical min/max limits. If a candidate trial degrades performance or exceeds the drawdown limit, Hermes triggers an automated rollback to the previous proven state.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Reflection Cadence */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground block">
                    Reflection Cadence (Closed Trades per Cycle)
                  </label>
                  <div className="flex items-center gap-2">
                    {[3, 5, 8, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCadenceInput(num)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-colors",
                          (cadenceInput ?? hermes.reflectionCadence) === num
                            ? "bg-amber-500 text-black border-amber-500"
                            : "bg-card border-border text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                      >
                        {num} Trades
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Controls how frequently the AI brain reviews closed trades and formulates parameter updates.
                  </span>
                </div>

                {/* Max Drawdown Limit */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground block">
                    Max Trial Drawdown Limit (%)
                  </label>
                  <div className="flex items-center gap-2">
                    {[3.0, 5.0, 8.0].map((dd) => (
                      <button
                        key={dd}
                        type="button"
                        onClick={() => setDrawdownInput(dd)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-colors",
                          (drawdownInput ?? hermes.maxDrawdownLimit) === dd
                            ? "bg-amber-500 text-black border-amber-500"
                            : "bg-card border-border text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                      >
                        {dd}%
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    If an active trial incurs drawdown beyond this point, Hermes forces an instant rollback.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Are you sure you want to restore Hermes parameters to factory defaults?")) {
                      resetMutation.mutate();
                    }
                  }}
                  disabled={resetMutation.isPending}
                  className="text-red-400 hover:text-red-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  {resetMutation.isPending ? "Resetting..." : "Restore Factory Defaults"}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="px-3 py-1.5 rounded-lg border border-border text-foreground text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateConfigMutation.mutate({
                        ...(cadenceInput ? { hermesReflectionCadence: cadenceInput } : {}),
                        ...(drawdownInput ? { hermesMaxDrawdownLimit: drawdownInput } : {}),
                      });
                    }}
                    disabled={updateConfigMutation.isPending}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold cursor-pointer"
                  >
                    {updateConfigMutation.isPending ? "Saving..." : "Save Guardrails"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
