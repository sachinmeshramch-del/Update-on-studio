import { useState, useCallback, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { LiveTickChart } from "./live-tick-chart";
import { useGetSignal } from "@workspace/api-client-react";
import { useRefreshInterval } from "@/hooks/useRefreshInterval";
import {
  X,
  Maximize2,
  Minimize2,
  ArrowUpDown,
  SlidersHorizontal,
  ExternalLink,
} from "lucide-react";
import { AdvancedRealTimeChart } from "react-ts-tradingview-widgets";

type Tab = "ticks" | "ohlc";

// Intraday-first timeframes with quick scalping options
const TIMEFRAMES = [
  { label: "1m",  value: "1" },
  { label: "5m",  value: "5" },
  { label: "15m", value: "15" },
  { label: "30m", value: "30" },
  { label: "1H",  value: "60" },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D" },
];

export function ChartWidget() {
  const cardRef = useRef<HTMLDivElement>(null);
  // Default to OHLC on 15-minute timeframe (15m)
  const [tab, setTab]                     = useState<Tab>("ohlc");
  const [interval, setInterval]           = useState(() => {
    try {
      return localStorage.getItem("gold_chart_timeframe") || "15";
    } catch {
      return "15";
    }
  });
  const [dismissed, setDismissed]         = useState(false);
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [isExpanded, setIsExpanded]       = useState(() => {
    try {
      return localStorage.getItem("gold_chart_expanded_height") === "true";
    } catch {
      return false;
    }
  });
  // On mobile screens (< 768px), default to hiding the drawing toolbar to give candles maximum width
  const [showDrawingTools, setShowDrawingTools] = useState(false);

  const { refreshInterval } = useRefreshInterval();
  const { data: signalData } = useGetSignal({
    query: {
      refetchInterval: refreshInterval > 0 ? refreshInterval : false,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: refreshInterval > 0 ? Math.min(3000, Math.floor(refreshInterval * 0.7)) : 0,
    } as any
  });
  const candlePattern = (signalData as any)?.candlePattern as string | null | undefined;
  const candleScore   = (signalData as any)?.candleScore   as number | undefined;

  // Auto-restore badge whenever a NEW pattern arrives
  useEffect(() => {
    if (candlePattern) setDismissed(false);
  }, [candlePattern]);

  const handleTimeframe = useCallback((val: string) => {
    setInterval(val);
    try {
      localStorage.setItem("gold_chart_timeframe", val);
    } catch {}
  }, []);

  const toggleHeight = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("gold_chart_expanded_height", String(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        if (cardRef.current?.requestFullscreen) {
          cardRef.current.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  }, []);

  // Handle Escape key and native fullscreen events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // Prevent body scroll in fullscreen
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    // Trigger window resize so charts recalculate their dimensions
    const resizeTimer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 150);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.body.style.overflow = "";
      clearTimeout(resizeTimer);
    };
  }, [isFullscreen, isExpanded]);

  const isBullish = (candleScore ?? 0) >= 0;
  const showBadge = !!candlePattern && !dismissed;
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <Card
      ref={cardRef}
      id="xauusd-chart-widget"
      className={cn(
        "flex flex-col overflow-hidden border-border bg-card/60 backdrop-blur-sm transition-all duration-200",
        isFullscreen
          ? "fixed inset-0 z-[100] w-screen h-screen rounded-none m-0 p-2 sm:p-4 bg-background shadow-2xl"
          : "h-full w-full rounded-xl"
      )}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-2.5 sm:p-4 border-b border-border bg-black/20 gap-2 sm:gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-foreground text-sm sm:text-base shrink-0">
            XAUUSD Live Chart
          </h2>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-wrap">
          {/* Tab switcher: LIVE TICKS vs OHLC */}
          <div className="flex bg-black/40 rounded-lg p-0.5 sm:p-1 border border-border">
            <button
              id="chart-tab-ticks"
              onClick={() => setTab("ticks")}
              className={cn(
                "px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1 cursor-pointer",
                tab === "ticks"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", tab === "ticks" ? "bg-black animate-pulse" : "bg-muted-foreground")} />
              TICKS
            </button>
            <button
              id="chart-tab-ohlc"
              onClick={() => setTab("ohlc")}
              className={cn(
                "px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-md transition-all duration-200 cursor-pointer",
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
            <div className="flex bg-black/40 rounded-lg p-0.5 sm:p-1 border border-border overflow-x-auto max-w-[220px] sm:max-w-none">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  id={`chart-tf-${tf.label.toLowerCase()}`}
                  onClick={() => handleTimeframe(tf.value)}
                  className={cn(
                    "px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold rounded transition-all duration-200 cursor-pointer whitespace-nowrap",
                    interval === tf.value
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}

          {/* Drawing Tools Toggle (OHLC tab only) */}
          {tab === "ohlc" && (
            <button
              id="chart-toggle-drawing-tools"
              onClick={() => setShowDrawingTools((prev) => !prev)}
              className={cn(
                "px-2 py-1 sm:py-1.5 rounded-lg border border-border text-[11px] sm:text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer",
                showDrawingTools
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-black/40 text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
              title={showDrawingTools ? "Hide drawing toolbar" : "Show drawing toolbar"}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{showDrawingTools ? "Tools On" : "Tools"}</span>
            </button>
          )}

          {/* Height Expand Toggle (only when not in fullscreen) */}
          {!isFullscreen && (
            <button
              id="chart-toggle-height"
              onClick={toggleHeight}
              className={cn(
                "px-2 py-1 sm:py-1.5 rounded-lg border border-border text-[11px] sm:text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer",
                isExpanded
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "bg-black/40 text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
              title={isExpanded ? "Collapse height" : "Expand chart height"}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isExpanded ? "Tall" : "Expand"}</span>
            </button>
          )}

          {/* External TradingView Link */}
          <a
            href="https://www.tradingview.com/chart/?symbol=OANDA%3AXAUUSD"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 sm:p-1.5 rounded-lg border border-border bg-black/40 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer hidden md:flex items-center justify-center"
            title="Open in TradingView web"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Fullscreen Button */}
          <button
            id="chart-fullscreen-toggle"
            onClick={toggleFullscreen}
            className={cn(
              "px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border text-[11px] sm:text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer",
              isFullscreen
                ? "bg-amber-500 text-black border-amber-400 font-semibold shadow-md"
                : "bg-black/40 border-border text-foreground hover:bg-white/10"
            )}
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "View Chart in Fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-black" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-amber-400">Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "w-full relative bg-background flex-grow transition-all duration-200",
          isFullscreen
            ? "h-[calc(100vh-65px)] min-h-0"
            : isExpanded
            ? "min-h-[720px] sm:min-h-[800px] lg:min-h-[850px]"
            : "min-h-[500px] sm:min-h-[580px] lg:min-h-[620px]"
        )}
      >
        {/* Live Tick Chart — always mounted, hidden when on OHLC tab */}
        <div className={cn("absolute inset-0 w-full h-full", tab === "ticks" ? "block" : "hidden")}>
          <LiveTickChart />
        </div>

        {/* TradingView OHLC — always mounted, hidden when on TICKS tab */}
        <div className={cn("absolute inset-0 w-full h-full", tab === "ohlc" ? "block" : "hidden")}>
          {tab === "ohlc" && (
            <AdvancedRealTimeChart
              key={`tv-${interval}-${isDark ? 'dark' : 'light'}-${showDrawingTools}-${isFullscreen ? 'fs' : 'normal'}`}
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
              hide_side_toolbar={!showDrawingTools}
              show_popup_button={true}
              withdateranges={true}
              save_image={false}
              autosize
            />
          )}
        </div>

        {/* ── Candlestick Pattern Overlay Badge ─────────────────────────────
             Floats neatly at the bottom-left so it never obscures the top
             symbol title, legend, or price action. */}
        {showBadge && (
          <div
            id="candlestick-pattern-badge"
            className={cn(
              "absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl",
              "border backdrop-blur-md shadow-lg text-xs font-bold tracking-wide",
              "animate-in fade-in slide-in-from-bottom-2 duration-300",
              isBullish
                ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-300 shadow-emerald-900/40"
                : "bg-red-950/90 border-red-500/50 text-red-300 shadow-red-900/40"
            )}
          >
            {/* Bias dot */}
            <span
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                isBullish ? "bg-emerald-400 animate-pulse" : "bg-red-400 animate-pulse"
              )}
            />

            {/* Pattern name */}
            <span>{candlePattern}</span>

            {/* Bias label */}
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-widest",
                isBullish
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              )}
            >
              {isBullish ? "BULLISH" : "BEARISH"}
            </span>

            {/* Dismiss button */}
            <button
              onClick={() => setDismissed(true)}
              className={cn(
                "ml-1 p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity cursor-pointer",
                isBullish ? "hover:bg-emerald-500/20" : "hover:bg-red-500/20"
              )}
              title="Clear pattern label"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

