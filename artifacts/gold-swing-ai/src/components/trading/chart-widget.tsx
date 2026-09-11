import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { LiveTickChart } from "./live-tick-chart";
import { useGetSignal } from "@workspace/api-client-react";
import { X } from "lucide-react";
import { AdvancedRealTimeChart } from "react-ts-tradingview-widgets";

type Tab = "ticks" | "ohlc";

// Intraday-first timeframes — default opens on 1H
const TIMEFRAMES = [
  { label: "15m", value: "15" },
  { label: "1H",  value: "60" },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D" },
];

export function ChartWidget() {
  // Default to OHLC for intraday trading
  const [tab, setTab]           = useState<Tab>("ohlc");
  const [interval, setInterval] = useState("15");
  const [dismissed, setDismissed] = useState(false);

  const { data: signalData } = useGetSignal({ query: { refetchInterval: 30_000 } as any });
  const candlePattern = (signalData as any)?.candlePattern as string | null | undefined;
  const candleScore   = (signalData as any)?.candleScore   as number | undefined;

  // Auto-restore badge whenever a NEW pattern arrives
  useEffect(() => {
    if (candlePattern) setDismissed(false);
  }, [candlePattern]);

  const handleTimeframe = useCallback((val: string) => {
    setInterval(val);
  }, []);

  const isBullish = (candleScore ?? 0) >= 0;
  const showBadge = !!candlePattern && !dismissed;
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <Card className="flex flex-col h-full overflow-hidden border-border bg-card/50 backdrop-blur-sm">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-black/20 gap-3 flex-wrap">
        <h2 className="font-semibold text-foreground shrink-0">XAUUSD Live Chart</h2>

        <div className="flex items-center gap-3 ml-auto">
          {/* Tab switcher */}
          <div className="flex bg-black/40 rounded-lg p-1 border border-border">
            <button
              onClick={() => setTab("ticks")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5",
                tab === "ticks"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", tab === "ticks" ? "bg-black animate-pulse" : "bg-muted-foreground")} />
              LIVE TICKS
            </button>
            <button
              onClick={() => setTab("ohlc")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200",
                tab === "ohlc"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              OHLC
            </button>
          </div>

          {/* Timeframe buttons — only shown on OHLC tab */}
          {tab === "ohlc" && (
            <div className="flex bg-black/40 rounded-lg p-1 border border-border">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => handleTimeframe(tf.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200",
                    interval === tf.value
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex-grow min-h-[480px] w-full relative bg-background">

        {/* Live Tick Chart — always mounted, hidden when on OHLC tab */}
        <div className={cn("absolute inset-0", tab === "ticks" ? "block" : "hidden")}>
          <LiveTickChart />
        </div>

        {/* TradingView OHLC — always mounted, hidden when on TICKS tab */}
        <div className={cn("absolute inset-0", tab === "ohlc" ? "block" : "hidden")}>
          {tab === "ohlc" && (
            <AdvancedRealTimeChart
              symbol="OANDA:XAUUSD"
              interval={interval as any}
              theme={isDark ? "dark" : "light"}
              timezone="Etc/UTC"
              style="1"
              locale="en"
              toolbar_bg={isDark ? "#131722" : "#ffffff"}
              enable_publishing={false}
              hide_top_toolbar={false}
              hide_legend={false}
              save_image={false}
              autosize
            />
          )}
        </div>

        {/* ── Candlestick Pattern Overlay Badge ─────────────────────────────
             Floats on top of both chart tabs. Auto-appears when a pattern
             is detected; × button clears it manually. Auto-restores on next
             new pattern.  z-10 keeps it above the iframe. */}
        {showBadge && (
          <div
            className={cn(
              "absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-2 rounded-xl",
              "border backdrop-blur-md shadow-lg text-xs font-bold tracking-wide",
              "animate-in fade-in slide-in-from-top-2 duration-300",
              isBullish
                ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 shadow-emerald-900/40"
                : "bg-red-950/80 border-red-500/40 text-red-700 dark:text-red-300 shadow-red-900/40"
            )}
          >
            {/* Bias dot */}
            <span className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              isBullish ? "bg-emerald-400 animate-pulse" : "bg-red-400 animate-pulse"
            )} />

            {/* Pattern name */}
            <span>{candlePattern}</span>

            {/* Bias label */}
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-widest",
              isBullish
                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/20 text-red-600 dark:text-red-400"
            )}>
              {isBullish ? "BULLISH" : "BEARISH"}
            </span>

            {/* Dismiss button */}
            <button
              onClick={() => setDismissed(true)}
              className={cn(
                "ml-1 p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity",
                isBullish ? "hover:bg-emerald-500/20" : "hover:bg-red-500/20"
              )}
              title="Clear pattern label"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

      </div>
    </Card>
  );
}
