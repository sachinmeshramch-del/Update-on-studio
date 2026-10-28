import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Zap, Target, TrendingUp, Check, Layers, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type StrategyEngineMode = "ICT_SILVER_BULLET" | "HYBRID_DUAL" | "DETERMINISTIC_ORB" | "ALPHA_TRADES_SD";

interface StrategyOption {
  id: StrategyEngineMode;
  label: string;
  shortLabel: string;
  icon: typeof Crosshair;
  tag: string;
  description: string;
  accentColor: string;
  activeRing: string;
  badgeBg: string;
}

export const STRATEGY_OPTIONS: StrategyOption[] = [
  {
    id: "ICT_SILVER_BULLET",
    label: "ICT Silver Bullet",
    shortLabel: "Silver Bullet",
    icon: Crosshair,
    tag: "Isolated · 1:3.4 R:R",
    description: "Pure ICT liquidity sweeps + 15m Fair Value Gap (FVG) displacement in London/NY killzones",
    accentColor: "text-amber-400",
    activeRing: "bg-amber-500 text-black shadow-md ring-2 ring-amber-400/50",
    badgeBg: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  {
    id: "HYBRID_DUAL",
    label: "Hybrid Dual-Engine",
    shortLabel: "Hybrid Dual",
    icon: Zap,
    tag: "ORB + SMC Confluence",
    description: "Alpha Trades S&D zones + 3h NY ORB breakout + Hermes SMC multi-timeframe trend filter",
    accentColor: "text-amber-500",
    activeRing: "bg-amber-500 text-black shadow-md ring-2 ring-amber-500/50",
    badgeBg: "bg-amber-500/20 text-amber-500 border-amber-500/40",
  },
  {
    id: "DETERMINISTIC_ORB",
    label: "Pure NY ORB",
    shortLabel: "Pure ORB",
    icon: Target,
    tag: "16:00 UTC Breakout",
    description: "100% Deterministic 3-hour New York opening range breakout with 5R asymmetric runner",
    accentColor: "text-sky-400",
    activeRing: "bg-sky-500 text-black shadow-md ring-2 ring-sky-400/50",
    badgeBg: "bg-sky-500/20 text-sky-400 border-sky-500/40",
  },
  {
    id: "ALPHA_TRADES_SD",
    label: "Alpha Trades S&D",
    shortLabel: "Supply & Demand",
    icon: TrendingUp,
    tag: "S&D Zones",
    description: "15m/1H institutional supply & demand zones with counter-trendline break confirmation",
    accentColor: "text-emerald-400",
    activeRing: "bg-emerald-500 text-black shadow-md ring-2 ring-emerald-400/50",
    badgeBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
];

interface StrategySelectorProps {
  variant?: "banner" | "compact" | "panel";
  className?: string;
}

export function StrategySelector({ variant = "banner", className }: StrategySelectorProps) {
  const queryClient = useQueryClient();
  const [localMode, setLocalMode] = useState<StrategyEngineMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gold_swing_engine_mode") as StrategyEngineMode;
      if (saved && ["ICT_SILVER_BULLET", "HYBRID_DUAL", "DETERMINISTIC_ORB", "ALPHA_TRADES_SD"].includes(saved)) {
        return saved;
      }
    }
    return "HYBRID_DUAL";
  });

  const { data: settings } = useQuery<{ engineMode?: StrategyEngineMode }>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    staleTime: 5000,
  });

  const switchMutation = useMutation({
    mutationFn: async (newMode: StrategyEngineMode) => {
      const res = await fetch("/api/hermes/set-engine-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineMode: newMode }),
      });
      if (!res.ok) throw new Error("Failed to update execution strategy");
      return res.json();
    },
    onMutate: async (newMode: StrategyEngineMode) => {
      await queryClient.cancelQueries({ queryKey: ["settings"] });
      await queryClient.cancelQueries({ queryKey: ["/api/hermes/orb-state"] });
      setLocalMode(newMode);
      if (typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", newMode);
        localStorage.setItem("gold_swing_backtest_strategy", newMode);
      }
      const previousSettings = queryClient.getQueryData(["settings"]);
      queryClient.setQueryData(["settings"], (old: any) => ({
        ...(old || {}),
        engineMode: newMode,
      }));
      queryClient.setQueryData(["/api/hermes/orb-state"], (old: any) => ({
        ...(old || {}),
        engineMode: newMode,
      }));
      return { previousSettings };
    },
    onSuccess: (data, newMode) => {
      setLocalMode(newMode);
      if (typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", newMode);
      }
      queryClient.setQueryData(["settings"], (old: any) => ({
        ...(old || {}),
        engineMode: newMode,
      }));
      queryClient.setQueryData(["/api/hermes/orb-state"], (old: any) => ({
        ...(old || {}),
        engineMode: newMode,
      }));
      const opt = STRATEGY_OPTIONS.find((s) => s.id === newMode);
      toast.success(`Active Strategy Switched to ${opt?.label || newMode}`, {
        description: opt?.description,
      });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/orb-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/diagnostics"] });
    },
    onError: (err: any, _newMode, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(["settings"], context.previousSettings);
      }
      toast.error("Failed to switch strategy", { description: err.message });
    },
  });

  const activeMode: StrategyEngineMode = localMode || (settings?.engineMode as StrategyEngineMode) || "HYBRID_DUAL";

  useEffect(() => {
    if (settings?.engineMode && !switchMutation.isPending && settings.engineMode !== localMode) {
      setLocalMode(settings.engineMode);
      if (typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", settings.engineMode);
      }
    }
  }, [settings?.engineMode, switchMutation.isPending]);

  const activeOption = STRATEGY_OPTIONS.find((o) => o.id === activeMode) || STRATEGY_OPTIONS[0];

  // ── 1. Compact Variant (For Header Top Bar) ───────────────────────────────────
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-border shrink-0 shadow-inner", className)}>
        <div className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-r border-border/60 mr-0.5 hidden xl:flex">
          <Layers className="w-3 h-3 text-amber-500" />
          <span>Strategy:</span>
        </div>
        {STRATEGY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = activeMode === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => switchMutation.mutate(opt.id)}
              disabled={switchMutation.isPending}
              title={`${opt.label} — ${opt.description}`}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                isSelected
                  ? opt.activeRing
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className="w-3 h-3" />
              <span>{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // ── 2. Panel Variant (Embedded inside SignalPanel) ─────────────────────────────
  if (variant === "panel") {
    return (
      <div className={cn("p-3 rounded-xl bg-card/60 border border-border/80 flex flex-col gap-2.5 shadow-sm", className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <span className="text-xs font-bold uppercase tracking-tight text-foreground">
              Active Strategy Engine
            </span>
          </div>
          <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5 border", activeOption.badgeBg)}>
            {activeOption.tag}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {STRATEGY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = activeMode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => switchMutation.mutate(opt.id)}
                disabled={switchMutation.isPending}
                className={cn(
                  "p-2 rounded-lg text-left transition-all border flex flex-col gap-0.5 cursor-pointer relative",
                  isSelected
                    ? "bg-amber-500/15 border-amber-500/60 shadow-sm text-foreground"
                    : "bg-background/40 border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-bold flex items-center gap-1.5", isSelected ? opt.accentColor : "")}>
                    <Icon className="w-3.5 h-3.5" />
                    {opt.shortLabel}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <span className="text-[10px] text-muted-foreground/80 line-clamp-1">
                  {opt.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 3. Banner Variant (Prominent Top Banner for Dashboard) ──────────────────────
  return (
    <div className={cn("p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-card/90 via-card/60 to-background/90 border border-border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Crosshair className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <span>Strategy Engine:</span>
              <span className="text-amber-400 font-extrabold">{activeOption.label}</span>
            </span>
            <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5 border", activeOption.badgeBg)}>
              {activeOption.tag}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {activeOption.description}
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-border w-full md:w-auto overflow-x-auto">
        {STRATEGY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = activeMode === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => switchMutation.mutate(opt.id)}
              disabled={switchMutation.isPending}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer flex-1 md:flex-initial justify-center",
                isSelected
                  ? opt.activeRing
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
