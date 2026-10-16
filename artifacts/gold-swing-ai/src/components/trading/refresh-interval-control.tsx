import { useState } from "react";
import { useRefreshInterval, REFRESH_OPTIONS } from "@/hooks/useRefreshInterval";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { RefreshCw, Check, Clock, ChevronDown, Zap } from "lucide-react";

interface RefreshControlProps {
  variant?: "header" | "compact" | "badge";
}

export function RefreshIntervalControl({ variant = "header" }: RefreshControlProps) {
  const {
    refreshInterval,
    setRefreshInterval,
    countdown,
    isRefreshing,
    triggerManualRefresh,
    currentOption,
  } = useRefreshInterval();

  const isPaused = refreshInterval <= 0;

  if (variant === "badge") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-black/5 dark:bg-white/5 text-[11px] text-muted-foreground">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isPaused
              ? "bg-zinc-500"
              : isRefreshing
              ? "bg-amber-500 animate-ping"
              : "bg-emerald-500 animate-pulse"
          }`}
        />
        <span>
          {isPaused ? "Auto-refresh paused" : `Auto-updating every ${currentOption.shortLabel}`}
        </span>
        {!isPaused && countdown > 0 && (
          <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">
            ({countdown}s)
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center rounded-lg border border-border bg-black/5 dark:bg-white/5 divide-x divide-border/60 shrink-0 shadow-sm">
      {/* ── Instant Refresh Trigger Button ── */}
      <button
        type="button"
        onClick={() => triggerManualRefresh(true)}
        disabled={isRefreshing}
        title="Refresh trading signals now"
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all disabled:opacity-50 cursor-pointer"
        id="manual-signal-refresh-btn"
      >
        <RefreshCw
          className={`w-3.5 h-3.5 transition-transform ${
            isRefreshing ? "animate-spin text-amber-500" : "text-muted-foreground"
          }`}
        />
        <span className="hidden sm:inline">Refresh</span>
      </button>

      {/* ── Dropdown Interval Selector ── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
            title="Configure trading signal refresh interval"
            id="refresh-interval-dropdown-trigger"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isPaused
                  ? "bg-zinc-400"
                  : isRefreshing
                  ? "bg-amber-500 animate-ping"
                  : "bg-emerald-500"
              }`}
            />
            <span className="font-mono font-medium text-[11px] sm:text-xs">
              {currentOption.shortLabel}
            </span>
            {!isPaused && countdown > 0 && (
              <span className="hidden md:inline font-mono text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                {countdown}s
              </span>
            )}
            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64 p-1.5 bg-popover/95 backdrop-blur-md border-border shadow-xl">
          <DropdownMenuLabel className="flex items-center justify-between text-xs font-semibold px-2 py-1.5 text-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Signal Refresh Cadence
            </span>
            {!isPaused && (
              <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                Active ({countdown}s)
              </span>
            )}
          </DropdownMenuLabel>
          <div className="text-[11px] text-muted-foreground px-2 pb-1.5">
            Periodic background queries update signals without reloading the page.
          </div>

          <DropdownMenuSeparator className="my-1" />

          {REFRESH_OPTIONS.map((opt) => {
            const isSelected = opt.value === refreshInterval;
            return (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setRefreshInterval(opt.value)}
                className={`flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium"
                    : "hover:bg-accent text-foreground"
                }`}
              >
                <div className="w-full flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    {opt.value === 5000 && <Zap className="w-3 h-3 text-amber-500" />}
                    {opt.label}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {opt.description}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
