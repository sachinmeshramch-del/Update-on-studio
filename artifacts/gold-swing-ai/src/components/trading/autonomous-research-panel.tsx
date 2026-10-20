import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Brain,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Activity,
  Sliders,
  Filter,
  Download,
  Copy,
  ChevronRight,
  Sparkles,
  Info,
  RefreshCw,
  Search,
  Check,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  ExternalLink,
  Zap,
  Shield,
  CheckCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface DiscoveredStrategy {
  id: string;
  name: string;
  version: string;
  category: string;
  signalLogicRef: string;
  supportedTimeframes: string[];
  availableParameters: Array<{
    name: string;
    type: string;
    default: any;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    description: string;
  }>;
  requiredWarmup: number;
  defaultConfig: Record<string, any>;
  validationStatus: string;
}

interface WalkForwardFold {
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

interface ResearchCandidate {
  candidateId: string;
  rank: number;
  strategyId: string;
  strategyName: string;
  timeframe: string;
  config: Record<string, any>;
  executionCostMode: string;
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
    spreadSensitivity: string;
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

interface TrailingStopComparisonItem {
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

interface ResearchCampaignState {
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
}

export function AutonomousResearchPanel() {
  const [state, setState] = useState<ResearchCampaignState | null>(null);
  const [strategies, setStrategies] = useState<DiscoveredStrategy[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ResearchCandidate | null>(null);
  const [proposedConfigModal, setProposedConfigModal] = useState<any | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const queryClient = useQueryClient();
  const [showApplyConfirm, setShowApplyConfirm] = useState<boolean>(false);
  const [applyEnv, setApplyEnv] = useState<"DEMO_ONLY" | "REAL_AND_DEMO" | "SETTINGS_ONLY">("DEMO_ONLY");
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [appliedInfo, setAppliedInfo] = useState<any | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");
  const [timeframeFilter, setTimeframeFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // AI Assistant state
  const [aiQuery, setAiQuery] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResponse, setAiResponse] = useState<any | null>(null);

  // Polling campaign status
  useEffect(() => {
    fetchStatus();
    fetchStrategies();

    const interval = setInterval(() => {
      fetchStatus();
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/research/status");
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    } catch {}
  }

  async function fetchStrategies() {
    try {
      const res = await fetch("/api/research/strategies");
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || []);
      }
    } catch {}
  }

  async function handleStartCampaign(forceRestart = false) {
    try {
      const res = await fetch("/api/research/campaign/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRestart, maxExperiments: 18 }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(forceRestart ? "Started fresh Autonomous Research Campaign!" : "Research campaign started!");
        fetchStatus();
      } else {
        toast.error(data.error || "Failed to start campaign");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start campaign");
    }
  }

  async function handlePauseCampaign() {
    try {
      const res = await fetch("/api/research/campaign/pause", { method: "POST" });
      if (res.ok) {
        toast.info("Campaign paused. State saved.");
        fetchStatus();
      }
    } catch {}
  }

  async function handleResumeCampaign() {
    try {
      const res = await fetch("/api/research/campaign/resume", { method: "POST" });
      if (res.ok) {
        toast.success("Campaign resumed from saved state!");
        fetchStatus();
      }
    } catch {}
  }

  async function handleCancelCampaign() {
    try {
      const res = await fetch("/api/research/campaign/cancel", { method: "POST" });
      if (res.ok) {
        toast.warning("Campaign cancelled.");
        fetchStatus();
      }
    } catch {}
  }

  async function handleGenerateProposedConfig(candidateId: string) {
    try {
      setShowApplyConfirm(false);
      setAppliedInfo(null);
      const res = await fetch("/api/research/proposed-config/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProposedConfigModal(data);
      } else {
        toast.error(data.error || "Could not generate proposed config");
      }
    } catch (err: any) {
      toast.error(err.message || "Error generating proposed config");
    }
  }

  async function handleApplyToLive() {
    if (!proposedConfigModal?.proposedConfig?.candidateReferenceId) return;
    setIsApplying(true);
    try {
      const res = await fetch("/api/research/apply-to-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: proposedConfigModal.proposedConfig.candidateReferenceId,
          targetEnvironment: applyEnv,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to apply strategy to live bot");
      }
      toast.success(data.message || "Strategy successfully merged into live bot!");
      setAppliedInfo(data.appliedConfig);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/orb-state"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to merge configuration to live bot");
    } finally {
      setIsApplying(false);
    }
  }

  async function handleQueryAi(queryText?: string) {
    const q = queryText || aiQuery;
    if (!q.trim()) return;

    setAiLoading(true);
    try {
      const res = await fetch("/api/research/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiResponse(data);
      } else {
        toast.error(data.error || "AI Assistant query failed");
      }
    } catch (err: any) {
      toast.error(err.message || "AI query error");
    } finally {
      setAiLoading(false);
    }
  }

  function handleExportCsv() {
    if (!state?.rankedCandidates || state.rankedCandidates.length === 0) {
      toast.error("No candidate results to export");
      return;
    }

    const headers = [
      "Rank",
      "Candidate ID",
      "Strategy Name",
      "Timeframe",
      "Status",
      "OOS Net Profit ($)",
      "Profit Factor",
      "Win Rate (%)",
      "Expectancy (R)",
      "Max Drawdown (%)",
      "Completed Trades",
      "Walk-Forward Consistency (%)",
      "Stressed Cost PF",
      "Survives Stress",
      "Run ID Ref",
    ];

    const rows = state.rankedCandidates.map(c => [
      c.rank,
      `"${c.candidateId}"`,
      `"${c.strategyName}"`,
      c.timeframe,
      c.recommendationStatus,
      c.overallMetrics.netProfitDollars,
      c.overallMetrics.profitFactor,
      c.overallMetrics.winRate,
      c.overallMetrics.expectancyR,
      c.overallMetrics.maxDrawdownPercent,
      c.overallMetrics.totalTrades,
      Math.round(c.walkForwardMetrics.consistencyScore * 100),
      c.stressTest.stressedCostPF,
      c.stressTest.survivesStress ? "YES" : "NO",
      `"${c.runIdRef}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `research_campaign_${state.campaignId}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported research campaign results to CSV");
  }

  const filteredCandidates = (state?.rankedCandidates || []).filter(c => {
    if (statusFilter !== "ALL" && c.recommendationStatus !== statusFilter) return false;
    if (strategyFilter !== "ALL" && c.strategyId !== strategyFilter) return false;
    if (timeframeFilter !== "ALL" && c.timeframe !== timeframeFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        c.candidateId.toLowerCase().includes(q) ||
        c.strategyName.toLowerCase().includes(q) ||
        c.recommendationStatus.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "VALIDATED_FOR_PAPER":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold">
            <ShieldCheck className="w-3 h-3 mr-1 inline" />
            Validated for paper testing
          </Badge>
        );
      case "PROMISING":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[11px] font-bold">
            <Sparkles className="w-3 h-3 mr-1 inline" />
            Promising
          </Badge>
        );
      case "INCONCLUSIVE":
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[11px] font-bold">
            <AlertTriangle className="w-3 h-3 mr-1 inline" />
            Inconclusive
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[11px] font-bold">
            <XCircle className="w-3 h-3 mr-1 inline" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Controller Hero & Execution Bar ─────────────────────────────── */}
      <Card className="border-border bg-card/60 shadow-xl overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-emerald-500 to-blue-500" />
        <CardContent className="p-5 md:p-6 space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-sm">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
                    Autonomous Strategy Research & Optimization Engine
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/30 border border-border text-muted-foreground uppercase">
                      Simulation Mode
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Systematic hypothesis testing, multi-timeframe optimization, walk-forward OOS validation, and stress testing for XAUUSD.
                  </p>
                </div>
              </div>
            </div>

            {/* Campaign Controls */}
            <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
              {state?.status === "RUNNING" ? (
                <>
                  <button
                    onClick={handlePauseCampaign}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Pause className="w-4 h-4" />
                    <span>Pause Campaign</span>
                  </button>
                  <button
                    onClick={handleCancelCampaign}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </>
              ) : state?.status === "PAUSED" ? (
                <>
                  <button
                    onClick={handleResumeCampaign}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Resume Campaign</span>
                  </button>
                  <button
                    onClick={() => handleStartCampaign(true)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-black/20 hover:bg-black/30 text-muted-foreground border border-border flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Restart Fresh</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleStartCampaign(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Research Campaign</span>
                  </button>
                  <button
                    onClick={handleExportCsv}
                    disabled={!state?.rankedCandidates?.length}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-black/20 hover:bg-black/40 text-foreground border border-border flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
                    title="Export all experiment results to CSV"
                  >
                    <Download className="w-4 h-4 text-amber-400" />
                    <span>Export CSV</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Live Progress Bar & Status Pill */}
          <div className="p-4 rounded-xl bg-black/30 border border-border/80 space-y-3">
            <div className="flex items-center justify-between text-xs flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-muted-foreground">Campaign Status:</span>
                <Badge
                  className={cn(
                    "text-[10px] font-mono font-bold uppercase",
                    state?.status === "RUNNING" && "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse",
                    state?.status === "COMPLETED" && "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                    state?.status === "PAUSED" && "bg-blue-500/20 text-blue-300 border-blue-500/40",
                    state?.status === "CANCELLED" && "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
                    state?.status === "IDLE" && "bg-black/40 text-muted-foreground border-border"
                  )}
                >
                  {state?.status || "IDLE"}
                </Badge>
                {state?.campaignId && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ({state.campaignId})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
                <span>
                  Completed: <strong className="text-foreground">{state?.completedCount || 0}</strong> / {state?.totalPlanned || 0}
                </span>
                <span>•</span>
                <span>
                  Remaining: <strong className="text-amber-400">{state?.remainingCount || 0}</strong>
                </span>
                {state?.status === "RUNNING" && state.estimatedTimeRemainingSec > 0 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Clock className="w-3 h-3" />
                      Est. ~{state.estimatedTimeRemainingSec}s remaining
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-black/40 rounded-full h-2.5 overflow-hidden border border-border/50">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-400 transition-all duration-500"
                style={{ width: `${state?.progressPercent || 0}%` }}
              />
            </div>

            {/* Currently Active Experiment Display */}
            {state?.status === "RUNNING" && state.currentExperiment && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground pt-1 flex-wrap">
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-foreground font-bold">Active Experiment:</span>
                <span className="text-amber-300">{state.currentExperiment.experimentId}</span>
                <span>—</span>
                <span>{state.currentExperiment.strategyName}</span>
                <span className="px-1.5 py-0.2 rounded bg-black/40 border border-border text-[10px]">
                  {state.currentExperiment.timeframe}
                </span>
              </div>
            )}
          </div>

          {/* Historical Data Readiness Diagnostics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {["1m", "5m", "15m", "1h"].map(tf => {
              const summary = state?.historicalDataSummary?.timeframes?.[tf];
              return (
                <div key={tf} className="p-3 rounded-xl bg-black/20 border border-border/70 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground font-mono">{tf.toUpperCase()} Feed</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-mono font-bold",
                        summary?.candleCount >= 100
                          ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                          : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                      )}
                    >
                      {summary?.dataQuality || "NO DATA"}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {summary?.candleCount ? `${summary.candleCount} candles stored` : "0 candles (sync required)"}
                  </div>
                  {summary?.gapCount !== undefined && (
                    <div className="text-[10px] text-muted-foreground">
                      {summary.gapCount === 0 ? "✓ 0 missing gaps" : `⚠ ${summary.gapCount} session intervals`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Auto-Discovered Strategies Registry ──────────────────────────── */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <span>Auto-Discovered Strategy & Sub-Engine Registry ({strategies.length})</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Inspects verified code modules in repository without rewriting or fabricating standalone implementations.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
              ✓ Verified In-Source Architecture
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {strategies.map(s => (
              <div key={s.id} className="p-3.5 rounded-xl bg-black/25 border border-border/80 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block font-mono">
                      {s.id} • {s.version}
                    </span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">{s.name}</h4>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                    {s.category.replace("_", " ")}
                  </Badge>
                </div>

                <div className="text-[11px] text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-foreground/80 font-semibold">Timeframes:</span>
                    {s.supportedTimeframes.map(tf => (
                      <span key={tf} className="px-1.5 py-0.5 rounded bg-black/40 border border-border text-[10px] font-mono">
                        {tf}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate" title={s.signalLogicRef}>
                    Ref: {s.signalLogicRef}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Warm-up: {s.requiredWarmup} bars</span>
                  <span className="text-emerald-400 font-medium">✓ Ready for Campaign</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Ranked Candidates Table ─────────────────────────────────────── */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Ranked Research Candidates ({filteredCandidates.length})</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Evaluated across out-of-sample edge, walk-forward consistency, drawdown resilience, and broker cost stress testing.
              </CardDescription>
            </div>

            {/* Filter Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter candidate..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-black/20 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500 w-36 sm:w-44"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-black/20 border border-border text-xs text-foreground focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="VALIDATED_FOR_PAPER">Validated for Paper</option>
                <option value="PROMISING">Promising</option>
                <option value="INCONCLUSIVE">Inconclusive</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                value={timeframeFilter}
                onChange={(e) => setTimeframeFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-black/20 border border-border text-xs text-foreground focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Timeframes</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!state?.rankedCandidates || state.rankedCandidates.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-black/20 border border-border/80 space-y-3">
              <Brain className="w-8 h-8 text-amber-500/50 mx-auto" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">No Research Results Yet</h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Click "Start Research Campaign" above to systematically evaluate all implemented strategies, trailing variants, and filters.
                </p>
              </div>
              <button
                onClick={() => handleStartCampaign(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black inline-flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Autonomous Campaign</span>
              </button>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No candidates match the active filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Candidate / Strategy</th>
                    <th className="py-2.5 px-3">Recommendation Status</th>
                    <th className="py-2.5 px-3 text-right">OOS Profit Factor</th>
                    <th className="py-2.5 px-3 text-right">Net Profit</th>
                    <th className="py-2.5 px-3 text-right">Max DD</th>
                    <th className="py-2.5 px-3 text-right">WF Consistency</th>
                    <th className="py-2.5 px-3 text-right">Trades</th>
                    <th className="py-2.5 px-3 text-center">Stress Test</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredCandidates.map(c => (
                    <tr
                      key={c.candidateId}
                      className="hover:bg-black/15 transition-colors group cursor-pointer"
                      onClick={() => setSelectedCandidate(c)}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-amber-400">
                        #{c.rank}
                      </td>
                      <td className="py-3 px-3 space-y-0.5">
                        <div className="font-bold text-foreground flex items-center gap-1.5">
                          <span>{c.strategyName}</span>
                          <span className="px-1.5 py-0.2 rounded bg-black/30 border border-border text-[9px] font-mono text-muted-foreground">
                            {c.timeframe}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {c.candidateId} • Run: {c.runIdRef?.slice(-8) || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {getStatusBadge(c.recommendationStatus)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        <span
                          className={cn(
                            c.overallMetrics.profitFactor >= 1.35
                              ? "text-emerald-400"
                              : c.overallMetrics.profitFactor >= 1.0
                              ? "text-amber-400"
                              : "text-rose-400"
                          )}
                        >
                          {c.overallMetrics.profitFactor.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold">
                        <span
                          className={cn(
                            c.overallMetrics.netProfitDollars > 0
                              ? "text-emerald-400"
                              : c.overallMetrics.netProfitDollars < 0
                              ? "text-rose-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {c.overallMetrics.netProfitDollars >= 0 ? "+" : ""}${c.overallMetrics.netProfitDollars.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {c.overallMetrics.maxDrawdownPercent.toFixed(2)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        <span
                          className={cn(
                            c.walkForwardMetrics.consistencyScore >= 0.75
                              ? "text-emerald-400"
                              : c.walkForwardMetrics.consistencyScore >= 0.5
                              ? "text-amber-400"
                              : "text-rose-400"
                          )}
                        >
                          {Math.round(c.walkForwardMetrics.consistencyScore * 100)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-foreground">
                        {c.overallMetrics.totalTrades}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono font-bold",
                            c.stressTest.survivesStress
                              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                              : "text-rose-400 border-rose-500/30 bg-rose-500/10"
                          )}
                        >
                          {c.stressTest.survivesStress ? "Survives" : "Fragile"} (PF: {c.stressTest.stressedCostPF.toFixed(2)})
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedCandidate(c)}
                            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-black/20 hover:bg-black/40 text-foreground border border-border cursor-pointer"
                            title="Inspect Walk-Forward Folds"
                          >
                            Details
                          </button>
                          {c.recommendationStatus === "VALIDATED_FOR_PAPER" && (
                            <button
                              onClick={() => handleGenerateProposedConfig(c.candidateId)}
                              className="px-2 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer"
                              title="Generate isolated proposed configuration"
                            >
                              Config
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Trailing Stop Optimization Comparison Matrix (6 Modes) ───────── */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-500" />
            <span>Fair Trailing-Stop Comparison Matrix (Identical Entry Signals)</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Evaluates exit management variants with entry signals and initial risk held perfectly constant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!state?.trailingStopComparison || state.trailingStopComparison.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Run an Autonomous Research campaign to populate the trailing-stop comparison matrix.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {state.trailingStopComparison.map(t => (
                <div
                  key={t.variant}
                  className={cn(
                    "p-3.5 rounded-xl border space-y-2.5 transition-all",
                    t.profitFactor >= 1.2
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : t.profitFactor >= 1.0
                      ? "bg-amber-500/5 border-amber-500/30"
                      : "bg-black/20 border-border"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-foreground font-mono">{t.variant}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-mono font-bold",
                        t.profitFactor >= 1.0 ? "text-emerald-400 border-emerald-500/30" : "text-rose-400 border-rose-500/30"
                      )}
                    >
                      PF {t.profitFactor.toFixed(2)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Net Profit</span>
                      <span className={cn("font-mono font-bold", t.netProfitDollars >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {t.netProfitDollars >= 0 ? "+" : ""}${t.netProfitDollars.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Max DD</span>
                      <span className="font-mono text-muted-foreground">{t.maxDrawdownPercent.toFixed(2)}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Avg Hold</span>
                      <span className="font-mono text-foreground">{t.avgHoldingMinutes} mins</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Expectancy</span>
                      <span className="font-mono text-amber-400">{t.expectancyR >= 0 ? "+" : ""}{t.expectancyR.toFixed(2)} R</span>
                    </div>
                  </div>

                  {/* Exit Reasons Distribution */}
                  <div className="pt-2 border-t border-border/60 text-[10px] font-mono text-muted-foreground flex items-center justify-between">
                    <span>Trades: {t.totalTrades}</span>
                    <span>Runner Rate: {t.runnerActivationRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AI Research Assistant Panel ─────────────────────────────────── */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>AI Quantitative Research Assistant</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Ask questions grounded strictly in empirical experiment results and run IDs without hallucinations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Action Prompt Buttons */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground text-[11px] font-semibold">Quick Prompts:</span>
            {[
              "Which strategies performed best out of sample?",
              "Why did the failed candidates fail?",
              "Which filters improved or reduced performance?",
              "Which trailing-stop method worked best under comparable conditions?",
              "Which candidate deserves the next validation experiment?",
            ].map(prompt => (
              <button
                key={prompt}
                onClick={() => {
                  setAiQuery(prompt);
                  handleQueryAi(prompt);
                }}
                disabled={aiLoading}
                className="px-2.5 py-1 rounded-lg bg-black/20 hover:bg-amber-500/10 text-muted-foreground hover:text-amber-300 border border-border/80 text-[11px] transition-all cursor-pointer disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Search Input Bar */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask the Quantitative Assistant about candidates, regimes, or parameters..."
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQueryAi()}
              className="flex-1 px-3.5 py-2 rounded-xl bg-black/30 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500 font-sans"
            />
            <button
              onClick={() => handleQueryAi()}
              disabled={aiLoading || !aiQuery.trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? "animate-spin" : ""}`} />
              <span>{aiLoading ? "Analyzing..." : "Ask Assistant"}</span>
            </button>
          </div>

          {/* Response Container */}
          {aiResponse && (
            <div className="p-4 rounded-xl bg-black/30 border border-border/90 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  <span>Quantitative Explanation Layer</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Grounded in Run IDs
                </span>
              </div>

              <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans">
                {aiResponse.answer}
              </div>

              {aiResponse.groundedReferences?.length > 0 && (
                <div className="pt-2 border-t border-border/60 flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="text-muted-foreground text-[10px] font-semibold uppercase">Referenced Candidates:</span>
                  {aiResponse.groundedReferences.map((ref: any) => (
                    <span
                      key={ref.candidateId}
                      className="px-2 py-0.5 rounded bg-black/40 border border-border font-mono text-[10px] text-amber-300"
                    >
                      {ref.candidateId} (PF: {ref.profitFactor})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Walk-Forward Details Modal ───────────────────────────────────── */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                  {selectedCandidate.candidateId} • Rank #{selectedCandidate.rank}
                </span>
                <h3 className="text-base font-bold text-foreground mt-0.5">
                  {selectedCandidate.strategyName} ({selectedCandidate.timeframe})
                </h3>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/20"
              >
                ✕
              </button>
            </div>

            {/* Recommendation Badges & Reasons */}
            <div className="p-3.5 rounded-xl bg-black/30 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Recommendation Status</span>
                {getStatusBadge(selectedCandidate.recommendationStatus)}
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                {selectedCandidate.recommendationReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {selectedCandidate.rejectionFlags.length > 0 && (
                <div className="pt-2 border-t border-border/60">
                  <span className="text-[11px] font-bold text-rose-400 block mb-1">Risk & Rejection Flags:</span>
                  <ul className="text-xs text-rose-300 space-y-0.5 list-disc list-inside">
                    {selectedCandidate.rejectionFlags.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Walk-Forward Rolling Folds Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-500" />
                <span>Walk-Forward Rolling Folds (In-Sample vs Out-of-Sample)</span>
              </h4>
              {selectedCandidate.walkForwardMetrics.folds.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 bg-black/20 rounded-xl">
                  Insufficient trade count for multi-fold walk-forward split.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedCandidate.walkForwardMetrics.folds.map(fold => (
                    <div
                      key={fold.foldIndex}
                      className={cn(
                        "p-3 rounded-xl border text-xs grid grid-cols-1 md:grid-cols-4 gap-2 items-center",
                        fold.isProfitable ? "bg-emerald-500/5 border-emerald-500/30" : "bg-rose-500/5 border-rose-500/30"
                      )}
                    >
                      <div>
                        <span className="font-mono font-bold text-foreground">Fold #{fold.foldIndex}</span>
                        <span className="text-[10px] text-muted-foreground block truncate">
                          OOS: {fold.oosRange.start?.slice(5, 16)} to {fold.oosRange.end?.slice(5, 16)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">In-Sample (Train)</span>
                        <span className="font-mono text-foreground font-semibold">
                          PF {fold.inSample.profitFactor} ({fold.inSample.tradesCount} trades)
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Out-of-Sample (Test)</span>
                        <span className={cn("font-mono font-bold", fold.isProfitable ? "text-emerald-400" : "text-rose-400")}>
                          PF {fold.outOfSample.profitFactor} (+${fold.outOfSample.netProfitDollars})
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">Degradation</span>
                        <span className={cn("font-mono", fold.degradationPercent > 50 ? "text-rose-400" : "text-emerald-400")}>
                          {fold.degradationPercent > 0 ? `-${fold.degradationPercent}%` : `+${Math.abs(fold.degradationPercent)}%`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <span className="text-[11px] font-mono text-muted-foreground">
                Run Ref: {selectedCandidate.runIdRef}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleGenerateProposedConfig(selectedCandidate.candidateId)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Generate Proposed Config</span>
                </button>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/20 hover:bg-black/40 text-foreground border border-border cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Proposed Configuration Review Modal (Safety Boundary) ───────── */}
      {proposedConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Proposed Configuration Review</h3>
                  <span className="text-xs text-muted-foreground font-mono">
                    Candidate: {proposedConfigModal.proposedConfig?.candidateReferenceId}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setProposedConfigModal(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/20"
              >
                ✕
              </button>
            </div>

            {/* Applied Success State */}
            {appliedInfo ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Strategy Successfully Merged to Live Engine!</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Active Strategy Mode set to <strong className="text-emerald-400">{appliedInfo.engineMode}</strong> with TP ratio {appliedInfo.parameters?.tpRatio}R and {appliedInfo.parameters?.trailingStopVariant} trailing stops.
                    </p>
                  </div>
                </div>
                <div className="bg-black/40 p-2.5 rounded-lg border border-border text-[11px] font-mono flex items-center justify-between">
                  <span>Environment: <strong className="text-foreground">{appliedInfo.targetEnvironment === "DEMO_ONLY" ? "MT5 Demo Auto-Trading (Active)" : appliedInfo.targetEnvironment === "REAL_AND_DEMO" ? "Live Real & Demo Trading (Active)" : "Passive Settings Synced"}</strong></span>
                  <span className="text-emerald-400 font-semibold">Live Synced ✓</span>
                </div>
                <button
                  onClick={() => {
                    setProposedConfigModal(null);
                    setShowApplyConfirm(false);
                    setAppliedInfo(null);
                  }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer transition-all shadow-lg shadow-emerald-500/10"
                >
                  Done & Return to Dashboard
                </button>
              </div>
            ) : showApplyConfirm ? (
              /* Confirmation & Environment Selection */
              <div className="space-y-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-sm font-bold text-foreground">1-Click Merge with Live Bot</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This will instantly configure your active MT5 bot execution parameters to match candidate <strong className="text-foreground">{proposedConfigModal.proposedConfig?.candidateReferenceId}</strong>.
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-black/30 p-2.5 rounded-lg border border-border">
                  <div>Strategy: <strong className="text-foreground">{proposedConfigModal.proposedConfig?.targetParameters?.strategyMode}</strong></div>
                  <div>Timeframe: <strong className="text-foreground">{proposedConfigModal.proposedConfig?.targetParameters?.timeframe}</strong></div>
                  <div>Take Profit: <strong className="text-foreground">{proposedConfigModal.proposedConfig?.targetParameters?.tpRatio}R</strong></div>
                  <div>Trailing Stop: <strong className="text-foreground">{proposedConfigModal.proposedConfig?.targetParameters?.trailingStopVariant}</strong></div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="text-xs font-semibold text-muted-foreground block">Select Execution Target:</label>
                  <div className="space-y-1.5 text-xs">
                    <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      applyEnv === "DEMO_ONLY" ? "bg-emerald-500/10 border-emerald-500/40 text-foreground" : "bg-black/20 border-border text-muted-foreground hover:border-border/80"
                    }`}>
                      <input
                        type="radio"
                        name="applyEnv"
                        checked={applyEnv === "DEMO_ONLY"}
                        onChange={() => setApplyEnv("DEMO_ONLY")}
                        className="mt-0.5 text-emerald-500"
                      />
                      <div>
                        <div className="font-bold flex items-center gap-1.5">
                          <span>🛡️ MT5 Demo Auto-Trading (Recommended Safe Mode)</span>
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[9px]">Zero Risk</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Activates auto-trading only on your demo MT5 account so you can monitor live tick fills safely without risking real capital.
                        </p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      applyEnv === "REAL_AND_DEMO" ? "bg-amber-500/10 border-amber-500/40 text-foreground" : "bg-black/20 border-border text-muted-foreground hover:border-border/80"
                    }`}>
                      <input
                        type="radio"
                        name="applyEnv"
                        checked={applyEnv === "REAL_AND_DEMO"}
                        onChange={() => setApplyEnv("REAL_AND_DEMO")}
                        className="mt-0.5 text-amber-500"
                      />
                      <div>
                        <div className="font-bold flex items-center gap-1.5">
                          <span>⚡ Real Live + Demo Trading</span>
                          <Badge className="bg-amber-500/20 text-amber-400 border-none text-[9px]">Live Execution</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Immediately triggers real live orders on your MT5 funded account using these new parameters on the next signal.
                        </p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      applyEnv === "SETTINGS_ONLY" ? "bg-blue-500/10 border-blue-500/40 text-foreground" : "bg-black/20 border-border text-muted-foreground hover:border-border/80"
                    }`}>
                      <input
                        type="radio"
                        name="applyEnv"
                        checked={applyEnv === "SETTINGS_ONLY"}
                        onChange={() => setApplyEnv("SETTINGS_ONLY")}
                        className="mt-0.5 text-blue-500"
                      />
                      <div>
                        <div className="font-bold">⚙️ Strategy Settings Only (Passive)</div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Saves strategy parameters into system settings without toggling automated order placement.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                  <button
                    onClick={() => setShowApplyConfirm(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-black/20 hover:bg-black/40 text-muted-foreground hover:text-foreground border border-border cursor-pointer"
                  >
                    Back to Config
                  </button>
                  <button
                    onClick={handleApplyToLive}
                    disabled={isApplying}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-black cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-500/10 transition-all disabled:opacity-50"
                  >
                    {isApplying ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Applying...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-black" />
                        <span>Confirm & Apply to Live Bot</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Standard Modal View */
              <>
                {/* Critical Safety Notice */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="block font-bold">Strict Safety Boundary Enforced:</strong>
                    <p className="text-[11px] leading-relaxed text-amber-200/90">
                      {proposedConfigModal.safetyDisclaimer}
                    </p>
                  </div>
                </div>

                {/* Config JSON View */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-muted-foreground">Configuration JSON:</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(proposedConfigModal.proposedConfig, null, 2));
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                        toast.success("Copied proposed config to clipboard!");
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? "Copied" : "Copy JSON"}</span>
                    </button>
                  </div>

                  <pre className="p-3.5 rounded-xl bg-black/40 border border-border text-[11px] font-mono text-foreground overflow-x-auto max-h-56">
                    {JSON.stringify(proposedConfigModal.proposedConfig, null, 2)}
                  </pre>
                </div>

                {/* Modal Actions */}
                <div className="pt-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      setProposedConfigModal(null);
                      setShowApplyConfirm(false);
                      setAppliedInfo(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-black/20 hover:bg-black/40 text-muted-foreground hover:text-foreground border border-border cursor-pointer"
                  >
                    Close Review
                  </button>

                  <button
                    onClick={() => setShowApplyConfirm(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-black flex items-center gap-1.5 shadow-lg shadow-amber-500/10 cursor-pointer transition-all"
                  >
                    <Zap className="w-3.5 h-3.5 fill-black" />
                    <span>⚡ 1-Click Apply to Live Bot</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
