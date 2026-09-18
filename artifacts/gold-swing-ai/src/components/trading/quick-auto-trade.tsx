import { useAutoTrade } from "@/hooks/useAutoTrade";
import { Switch } from "@/components/ui/switch";
import { Bot, Zap, Shield, ArrowLeftRight, CheckCircle2, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAutoTradeProps {
  variant?: "header" | "panel" | "compact";
  className?: string;
}

export function QuickAutoTrade({ variant = "panel", className }: QuickAutoTradeProps) {
  const {
    mode,
    isAutoEnabled,
    isPending,
    toggleAutoTrade,
    toggleTradingMode,
  } = useAutoTrade();

  if (variant === "header") {
    return (
      <div className={cn("flex items-center gap-1.5 shrink-0", className)}>
        {/* Trading Mode switch pill */}
        <button
          type="button"
          onClick={toggleTradingMode}
          disabled={isPending}
          title={`Click to switch between DEMO and REAL mode (Currently: ${mode})`}
          className={cn(
            "text-[10px] font-mono font-bold uppercase px-2 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 select-none",
            mode === "REAL"
              ? "bg-red-500/15 text-red-500 border-red-500/30 hover:bg-red-500/25"
              : "bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25"
          )}
        >
          <span>{mode}</span>
          <ArrowLeftRight className="w-2.5 h-2.5 opacity-60" />
        </button>

        {/* Master Quick Auto-Trade Toggle button */}
        <button
          type="button"
          onClick={() => toggleAutoTrade()}
          disabled={isPending}
          title={`Click to toggle Auto-Trading ${isAutoEnabled ? 'OFF' : 'ON'} for ${mode} account`}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all duration-200 cursor-pointer select-none",
            isAutoEnabled
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/10"
              : "bg-muted/80 border-border text-muted-foreground hover:border-zinc-500/40 hover:text-foreground"
          )}
        >
          <Bot className={cn("w-3.5 h-3.5", isAutoEnabled ? "text-emerald-500 animate-pulse" : "text-muted-foreground")} />
          <span className="font-mono tracking-wide">
            AUTO: <span className={isAutoEnabled ? "font-bold" : ""}>{isAutoEnabled ? "ON" : "OFF"}</span>
          </span>
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isAutoEnabled ? "bg-emerald-500 animate-ping" : "bg-zinc-500/50"
            )}
          />
        </button>
      </div>
    );
  }

  // Panel Variant (embedded inside or above the Signal Panel)
  return (
    <div
      className={cn(
        "rounded-2xl border transition-all p-3.5 sm:p-4 shadow-sm relative overflow-hidden",
        isAutoEnabled
          ? "bg-emerald-500/[0.04] border-emerald-500/30 dark:bg-emerald-500/[0.06]"
          : "bg-card/70 border-border dark:bg-card/40",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all",
              isAutoEnabled
                ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/40 shadow-sm shadow-emerald-500/20"
                : "bg-muted text-muted-foreground border-border"
            )}
          >
            {isAutoEnabled ? (
              <Zap className="w-5 h-5 text-emerald-500 animate-pulse" />
            ) : (
              <Bot className="w-5 h-5 text-muted-foreground" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs sm:text-sm text-foreground tracking-tight">
                Auto-Trading
              </span>

              <span
                className={cn(
                  "text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border flex items-center gap-1",
                  isAutoEnabled
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border"
                )}
              >
                {isAutoEnabled ? (
                  <>
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>ACTIVE</span>
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-2.5 h-2.5" />
                    <span>PAUSED</span>
                  </>
                )}
              </span>

              {/* Mode switch pill */}
              <button
                type="button"
                onClick={toggleTradingMode}
                disabled={isPending}
                title="Click to switch between DEMO and REAL mode"
                className={cn(
                  "text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-1",
                  mode === "REAL"
                    ? "bg-red-500/15 text-red-500 border-red-500/30 hover:bg-red-500/25"
                    : "bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25"
                )}
              >
                <span>{mode}</span>
                <ArrowLeftRight className="w-2.5 h-2.5 opacity-60" />
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
              {isAutoEnabled
                ? `Auto-dispatching confirmed signals to MetaApi (${mode})`
                : `Manual review only · Automated execution is disabled`}
            </p>
          </div>
        </div>

        {/* Large Tactile Switch */}
        <div className="flex items-center gap-2 shrink-0">
          <label
            htmlFor="quick-auto-trade-switch"
            className="text-xs font-mono font-bold cursor-pointer hidden min-[420px]:inline"
          >
            <span className={isAutoEnabled ? "text-emerald-500" : "text-muted-foreground"}>
              {isAutoEnabled ? "ON" : "OFF"}
            </span>
          </label>
          <Switch
            id="quick-auto-trade-switch"
            checked={isAutoEnabled}
            disabled={isPending}
            onCheckedChange={(checked) => toggleAutoTrade(checked)}
            className={cn(
              "cursor-pointer transition-all",
              isAutoEnabled && "data-[state=checked]:bg-emerald-500 shadow-sm shadow-emerald-500/20"
            )}
          />
        </div>
      </div>
    </div>
  );
}
