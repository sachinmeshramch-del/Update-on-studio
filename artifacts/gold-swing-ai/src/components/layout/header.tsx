import { Activity, TrendingUp, TrendingDown, Wifi, WifiOff, Bell, BellOff, Server } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePriceStream } from "@/hooks/usePriceStream";
import { useNotifications } from "@/hooks/useNotifications";
import { useConnections } from "@/hooks/useConnections";
import { cn } from "@/lib/utils";
import { ModeToggle } from "@/components/mode-toggle";
import { SettingsDialog } from "./settings-dialog";
import { useToast } from "@/hooks/use-toast";

function formatNum(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Split a price into integer part and decimal part for styling
function splitPrice(price: number) {
  const [int, dec] = price.toFixed(2).split(".");
  return { int: int.replace(/\B(?=(\d{3})+(?!\d))/g, ","), dec };
}

export function Header() {
  const { data, connected, error, transport } = usePriceStream();
  const { status: notifStatus, enable: enableNotifs, disable: disableNotifs } = useNotifications();
  const connections = useConnections();
  const [flashClass, setFlashClass] = useState("");
  const prevPriceRef = useRef<number | null>(null);
  const [blinkOn, setBlinkOn] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<{
    tradingMode: "DEMO" | "REAL";
    autoTradingDemoEnabled: boolean;
    autoTradingRealEnabled: boolean;
    demoAccountId: string;
    realAccountId: string;
  }>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (updated: Record<string, any>) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Failed to update setting");
      return res.json();
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({
        title: "Auto-Trade Updated",
        description: `Demo Auto: ${saved.autoTradingDemoEnabled ? "ON" : "OFF"} | Real Auto: ${saved.autoTradingRealEnabled ? "ON" : "OFF"}`
      });
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    }
  });

  // Blink live dot
  useEffect(() => {
    const id = setInterval(() => setBlinkOn(v => !v), 600);
    return () => clearInterval(id);
  }, []);

  // Flash green/red when price direction changes
  useEffect(() => {
    if (!data) return undefined;
    if (prevPriceRef.current === null) {
      prevPriceRef.current = data.price;
      return undefined;
    }
    if (data.price !== prevPriceRef.current) {
      const cls = data.direction === "up" ? "flash-up" : data.direction === "down" ? "flash-down" : "";
      prevPriceRef.current = data.price;
      if (cls) {
        setFlashClass(cls);
        const t = setTimeout(() => setFlashClass(""), 350);
        return () => clearTimeout(t);
      }
    }
    return undefined;
  }, [data?.price, data?.direction]);

  const isUp = (data?.change ?? 0) >= 0;

  return (
    <>
      {/* Flash animation styles */}
      <style>{`
        .flash-up   { animation: flash-green 0.35s ease-out; }
        .flash-down { animation: flash-red   0.35s ease-out; }
        @keyframes flash-green {
          0%   { background-color: rgba(34,197,94,0.25); }
          100% { background-color: transparent; }
        }
        @keyframes flash-red {
          0%   { background-color: rgba(239,68,68,0.25); }
          100% { background-color: transparent; }
        }
      `}</style>
      {/* ── Persistent Connection Status Bar ─────────────────────────── */}
      <div className="w-full bg-card border-b border-border px-3 py-1.5 flex items-center justify-between text-[10px] sm:text-[11px] font-mono overflow-x-auto hide-scrollbar gap-4 z-[60] relative">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground uppercase tracking-widest">Active Source:</span>
          <span className={cn(
             "font-bold uppercase flex items-center gap-1.5",
             data?.source === "metaapi" ? "text-green-600 dark:text-green-400" :
             data?.source === "twelvedata" ? "text-amber-600 dark:text-amber-400" :
             "text-red-600 dark:text-red-400"
          )}>
            <span
              className="w-1.5 h-1.5 rounded-full transition-colors duration-200"
              style={{ backgroundColor: blinkOn && connected ? "currentColor" : "transparent" }}
            />
            {data?.source || "none"}
          </span>
        </div>
        
        <div className="flex items-center gap-3.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground uppercase">Mode:</span>
            <button
              type="button"
              onClick={() => {
                const nextMode = settings?.tradingMode === "REAL" ? "DEMO" : "REAL";
                toggleMutation.mutate({ tradingMode: nextMode });
              }}
              title="Click to toggle Trading Mode"
              className={cn(
                "font-bold uppercase px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-all hover:opacity-80 active:scale-95",
                settings?.tradingMode === "REAL"
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                  : "bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30"
              )}
            >
              {settings?.tradingMode || "DEMO"}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground uppercase">Auto Demo:</span>
            <button
              type="button"
              onClick={() => {
                toggleMutation.mutate({ autoTradingDemoEnabled: !settings?.autoTradingDemoEnabled });
              }}
              title="Click to toggle Demo Auto-Trading"
              className={cn(
                "font-bold uppercase px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-all hover:opacity-80 active:scale-95",
                settings?.autoTradingDemoEnabled
                  ? "bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30 shadow-xs"
                  : "bg-muted text-muted-foreground/70 border border-border"
              )}
            >
              {settings?.autoTradingDemoEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground uppercase">Auto Real:</span>
            <button
              type="button"
              onClick={() => {
                toggleMutation.mutate({ autoTradingRealEnabled: !settings?.autoTradingRealEnabled });
              }}
              title="Click to toggle Real Auto-Trading"
              className={cn(
                "font-bold uppercase px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-all hover:opacity-80 active:scale-95",
                settings?.autoTradingRealEnabled
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 shadow-xs"
                  : "bg-muted text-muted-foreground/70 border border-border"
              )}
            >
              {settings?.autoTradingRealEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground uppercase">MetaApi:</span>
            <span className={cn(
              "font-bold uppercase",
              connections?.metaapi === "connected" ? "text-green-600 dark:text-green-400" :
              connections?.metaapi === "connecting" ? "text-amber-600 dark:text-amber-400" :
              "text-red-600 dark:text-red-400"
            )}>{connections?.metaapi || "disconnected"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground uppercase">TwelveData:</span>
            <span className={cn(
              "font-bold uppercase",
              connections?.twelvedata === "connected" ? "text-green-600 dark:text-green-400" :
              connections?.twelvedata === "connecting" ? "text-amber-600 dark:text-amber-400" :
              "text-red-600 dark:text-red-400"
            )}>{connections?.twelvedata || "disconnected"}</span>
          </div>
        </div>
      </div>


      <header className="sticky top-0 z-50 w-full border-b border-border bg-background backdrop-blur-xl">
        <div className="container mx-auto px-2 sm:px-4 h-[60px] sm:h-[72px] flex items-center justify-between gap-2 sm:gap-4 overflow-x-auto hide-scrollbar">

          {/* ── Brand ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <Activity className="text-black w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="hidden sm:block relative group">
              <h1 className="text-base font-bold tracking-tight text-foreground leading-none">Gold Scalp AI</h1>
                            <div className="flex items-center gap-2 mt-1 cursor-help">
                <span className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase">
                  XAUUSD
                </span>
                
                <div 
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: !connected 
                      ? "rgba(239,68,68,0.1)" 
                      : data?.source === "metaapi" || data?.source === "twelvedata"
                        ? "rgba(34,197,94,0.1)"
                        : "rgba(234,179,8,0.1)",
                    borderColor: !connected 
                      ? "rgba(239,68,68,0.2)" 
                      : data?.source === "metaapi" || data?.source === "twelvedata"
                        ? "rgba(34,197,94,0.2)"
                        : "rgba(234,179,8,0.2)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: blinkOn && connected ? "#22c55e" : connected ? "#16a34a" : "#ef4444" }}
                  />
                  <span
                    className="text-[11px] font-mono font-bold uppercase tracking-wide flex items-center gap-1"
                    style={{
                      color: !connected
                        ? "#ef4444"
                        : data?.source === "metaapi" || data?.source === "twelvedata"
                          ? "#22c55e"
                          : data?.source === "finnhub"
                            ? "#eab308"
                            : "#6b7280",
                    }}
                  >
                    {!connected
                      ? (error ? "RECONNECTING" : "CONNECTING")
                      : data?.source === "metaapi"
                        ? "MetaApi Live"
                      : data?.source === "twelvedata"
                        ? "TwelveData Live"
                          : "LIVE"}
                  </span>
                </div>
              </div>
              
              {/* Hover popup for connections */}
              <div className="absolute top-full left-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-3 flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Upstream Streams</h3>
                
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-foreground">MetaApi</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold",
                    connections?.metaapi === "connected" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                    connections?.metaapi === "connecting" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                    "bg-red-500/10 text-red-600 dark:text-red-400"
                  )}>{connections?.metaapi || "disconnected"}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-foreground">TwelveData</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] uppercase font-bold",
                    connections?.twelvedata === "connected" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                    connections?.twelvedata === "connecting" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                    "bg-red-500/10 text-red-600 dark:text-red-400"
                  )}>{connections?.twelvedata || "disconnected"}</span>
                </div>

                
                <div className="mt-1 pt-2 border-t border-border flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Active Source</span>
                  <span className="text-amber-600 dark:text-amber-400 uppercase font-bold">{connections?.activeSource || "none"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bid / Ask block ──────────────────────────────────────────── */}
          <div className={cn("flex items-stretch gap-px rounded-xl overflow-hidden border border-border shrink-0", flashClass)}>

            {/* BID */}
            <div className="flex flex-col items-center justify-center dark:bg-[#0a1a0f] bg-green-500/10 px-2 sm:px-4 py-1 sm:py-2 min-[400px]:min-w-[110px] min-w-[80px]">
              <span className="text-[8px] sm:text-[9px] font-bold tracking-[0.2em] text-green-600/60 dark:text-green-400/60 uppercase mb-0.5">BID</span>
              {data ? (
                <span className="font-mono font-bold leading-none tabular-nums text-green-600 dark:text-green-400">
                  <span className="text-lg sm:text-xl">{splitPrice(data.bid).int}.</span>
                  <span className="text-xl sm:text-2xl">{splitPrice(data.bid).dec}</span>
                </span>
              ) : (
                <span className="font-mono text-lg sm:text-xl font-bold text-green-600/30 dark:text-green-400/30 animate-pulse">――――</span>
              )}
            </div>

            {/* Spread */}
            <div className="flex flex-col items-center justify-center bg-card px-3 py-2">
              <span className="text-[8px] sm:text-[9px] font-bold tracking-[0.15em] text-muted-foreground/60 uppercase mb-0.5">SPREAD</span>
              <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                {data ? data.spread.toFixed(2) : "0.35"}
              </span>
            </div>

            {/* ASK */}
            <div className="flex flex-col items-center justify-center dark:bg-[#1a0a0a] bg-red-500/10 px-2 sm:px-4 py-1 sm:py-2 min-[400px]:min-w-[110px] min-w-[80px]">
              <span className="text-[8px] sm:text-[9px] font-bold tracking-[0.2em] text-red-600/60 dark:text-red-400/60 uppercase mb-0.5">ASK</span>
              {data ? (
                <span className="font-mono font-bold leading-none tabular-nums text-red-600 dark:text-red-400">
                  <span className="text-lg sm:text-xl">{splitPrice(data.ask).int}.</span>
                  <span className="text-xl sm:text-2xl">{splitPrice(data.ask).dec}</span>
                </span>
              ) : (
                <span className="font-mono text-lg sm:text-xl font-bold text-red-600/30 dark:text-red-400/30 animate-pulse">――――</span>
              )}
            </div>
          </div>

          
          {/* ── Theme Toggle & Notifications ───────────────────────────── */}
          <div className="flex items-center gap-2 shrink-0">
            <SettingsDialog />
            <ModeToggle />

          {notifStatus !== "unsupported" && (
            <button
              onClick={notifStatus === "subscribed" ? disableNotifs : enableNotifs}
              title={
                notifStatus === "subscribed" ? "Disable signal notifications" :
                notifStatus === "denied"     ? "Notifications blocked — allow in browser settings" :
                notifStatus === "loading"    ? "Enabling…" :
                "Get push alerts when a signal fires"
              }
              disabled={notifStatus === "loading" || notifStatus === "denied"}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 shrink-0",
                notifStatus === "subscribed"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                  : notifStatus === "denied"
                    ? "border-red-500/30 bg-red-500/5 text-red-600/60 dark:text-red-400/60 cursor-not-allowed"
                    : notifStatus === "loading"
                      ? "border-border bg-black/5 dark:bg-white/5 text-muted-foreground animate-pulse cursor-wait"
                      : "border-border bg-black/5 dark:bg-white/5 text-muted-foreground hover:border-amber-500/30 hover:text-amber-600 dark:hover:text-amber-400"
              )}
            >
              {notifStatus === "subscribed" ? (
                <><Bell className="w-3.5 h-3.5" /><span className="hidden sm:inline">Alerts ON</span></>
              ) : notifStatus === "denied" ? (
                <><BellOff className="w-3.5 h-3.5" /><span className="hidden sm:inline">Blocked</span></>
              ) : (
                <><Bell className="w-3.5 h-3.5" /><span className="hidden sm:inline">Alerts</span></>
              )}
            </button>
          )}
          </div>

          {/* ── Change + 24H stats ───────────────────────────────────────── */}
          <div className="flex items-center gap-5">
            {data ? (
              <>
                <div className="flex flex-col items-end">
                  <div className={cn(
                    "flex items-center gap-1 text-xs sm:text-sm font-bold font-mono tabular-nums flex-wrap justify-end",
                    isUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {(data.change || 0) > 0 ? "+" : ""}{formatNum(data.change || 0)} ({(data.changePercent || 0) > 0 ? "+" : ""}{(data.changePercent || 0).toFixed(2)}%)
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">
                    {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
                  </span>
                </div>

                <div className="hidden md:flex flex-col text-[11px] font-mono text-muted-foreground gap-1 border-l border-border pl-5">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground/60">24H HIGH</span>
                    <span className="text-foreground tabular-nums">{formatNum(data.high24h || data.price || 0)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground/60">24H LOW</span>
                    <span className="text-foreground tabular-nums">{formatNum(data.low24h || data.price || 0)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {error ? (
                  <><WifiOff className="w-4 h-4 text-red-600 dark:text-red-400" /><span className="text-red-600 dark:text-red-400 text-xs">No connection</span></>
                ) : (
                  <><Wifi className="w-4 h-4 animate-pulse" /><span className="text-xs animate-pulse">Connecting to live feed…</span></>
                )}
              </div>
            )}
          </div>

        </div>
      </header>
    </>
  );
}
