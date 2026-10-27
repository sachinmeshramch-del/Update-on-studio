import { useState, useEffect, useRef } from "react";
import { useGetSignal } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertCircle, Target, ShieldX, ArrowRightCircle,
  TrendingUp, TrendingDown, Minus, Zap,
  Globe, FlameKindling, Sparkles, Activity, Timer, MoonStar, RotateCcw, Repeat, RefreshCw, Volume2, VolumeX, ShieldAlert, Clock,
} from "lucide-react";
import { CooldownTimer } from "./cooldown-timer";
import { QuickAutoTrade } from "./quick-auto-trade";
import { StrategySelector } from "./strategy-selector";
import { useRefreshInterval } from "@/hooks/useRefreshInterval";
import { motion } from "framer-motion";

// ── Session badge ──────────────────────────────────────────────────────────────
function SessionBadge({ active, asian }: { active?: string; asian?: boolean }) {
  if (!active) return null;
  const closed = active === "Market Closed";
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide ${
      closed
        ? "bg-zinc-500/10 border-zinc-500/30 text-zinc-600 dark:text-zinc-400"
        : asian
        ? "bg-orange-500/10 border-orange-500/25 text-orange-600 dark:text-orange-600 dark:text-orange-400"
        : "bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400"
    }`}>
      {closed ? <MoonStar className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
      {active}
      {!closed && asian && <span className="text-orange-600/60 dark:text-orange-600/60 dark:text-orange-400/60">· Low liq.</span>}
    </div>
  );
}



// ── Range badge ─────────────────────────────────────────────────────────────
function RangeBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/40">
      <Repeat className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wide">RANGE BOUNCE</span>
    </div>
  );
}



// ── Reversal badge ─────────────────────────────────────────────────────────────
function ReversalBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/40">
      <RotateCcw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
      <span className="text-xs font-bold text-purple-600 dark:text-purple-400 tracking-wide">REVERSAL TRADE</span>
    </div>
  );
}

// ── ORB Breakout badge ─────────────────────────────────────────────────────────
function OrbBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40">
      <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tracking-wide">ORB BREAKOUT</span>
    </div>
  );
}

// ── Alpha Trades S&D badge ───────────────────────────────────────────────────
function AlphaTradesBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40">
      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
      <span className="text-xs font-bold text-emerald-400 tracking-wide">ALPHA TRADES S&D</span>
    </div>
  );
}

// ── Dual Synergy badge ─────────────────────────────────────────────────────────
function DualSynergyBadge() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 animate-pulse">
      <Zap className="w-3.5 h-3.5 text-amber-500" />
      <span className="text-xs font-bold text-amber-500 tracking-wide">DUAL ENGINE SYNERGY</span>
    </div>
  );
}

// ── Strength badge ─────────────────────────────────────────────────────────────
function StrengthBadge({ strength }: { strength: "STRONG" | "NORMAL" | null }) {
  if (strength === "STRONG") return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
      <FlameKindling className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 tracking-wide">STRONG SIGNAL</span>
    </div>
  );
  if (strength === "NORMAL") return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30">
      <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wide">NORMAL SIGNAL</span>
    </div>
  );
  return null;
}

// ── Score bar ──────────────────────────────────────────────────────────────────
function ScoreBar({
  label, value, max, color,
}: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0 font-medium">{label}</span>
      <div className="flex-1 bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
        <motion.div
          className={`h-1.5 rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px] font-mono w-10 text-right flex-shrink-0 text-muted-foreground">
        {value}/{max}
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

function playSignalBeep() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {
    console.error("Audio playback failed", e);
  }
}

export function SignalPanel() {
  const queryClient = useQueryClient();
  const [isResettingGuard, setIsResettingGuard] = useState(false);
  const { refreshInterval, countdown, isRefreshing, triggerManualRefresh, currentOption } = useRefreshInterval();
  const { data: signalDataRaw, isLoading, isError, refetch, isFetching } = useGetSignal({
    query: {
      refetchInterval: refreshInterval > 0 ? refreshInterval : false,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: refreshInterval > 0 ? Math.min(3000, Math.floor(refreshInterval * 0.7)) : 0,
    } as any
  });
  const signalData = signalDataRaw as any;

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("goldSwingSoundEnabled");
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("goldSwingSoundEnabled", JSON.stringify(soundEnabled));
    } catch {}
  }, [soundEnabled]);
  const prevSignalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!signalData) return;
    const currentId = signalData.timestamp + "_" + signalData.signal;
    if (prevSignalIdRef.current && prevSignalIdRef.current !== currentId) {
       if (signalData.signal !== "HOLD" && soundEnabled) {
          playSignalBeep();
       }
    }
    prevSignalIdRef.current = currentId;
  }, [signalData, soundEnabled]);

  const [isTriggeringBroker, setIsTriggeringBroker] = useState(false);

  const handleTriggerTradeOnBroker = async () => {
    setIsTriggeringBroker(true);
    try {
      const res = await fetch("/api/trade/trigger-running-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Successfully triggered current signal on MT5 Broker!");
        queryClient.invalidateQueries({ queryKey: ["/api/trading/running-trade"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trading/history"] });
      } else {
        toast.error(data.error || "Broker rejected execution");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to trigger trade on broker");
    } finally {
      setIsTriggeringBroker(false);
    }
  };


  if (isLoading) {
    return (
      <Card className="h-full bg-card/50">
        <CardContent className="p-6 flex flex-col gap-6">
          <Skeleton className="h-24 w-full bg-black/5 dark:bg-white/5 rounded-2xl" />
          <Skeleton className="h-16 w-full bg-black/5 dark:bg-white/5 rounded-xl" />
          <Skeleton className="h-8 w-3/4 bg-black/5 dark:bg-white/5" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-20 w-full bg-black/5 dark:bg-white/5" />
            <Skeleton className="h-20 w-full bg-black/5 dark:bg-white/5" />
            <Skeleton className="h-20 w-full bg-black/5 dark:bg-white/5" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !signalData) {
    return (
      <Card className="h-full flex items-center justify-center border-destructive/20 bg-destructive/5">
        <div className="text-center text-destructive flex flex-col items-center gap-2">
          <AlertCircle className="w-8 h-8" />
          <p>Failed to load intraday signal</p>
        </div>
      </Card>
    );
  }

  const {
    signal, confidence, entryPrice, stopLoss, takeProfit,
    trend, reason, timestamp, tradeDuration, cooldownRemaining,
    signalStrength, spikeCooldownCandles, spikeCooldownRemaining,
    emaScore, rsiScore, macdScore, momentumScore, fvgScore, sweepScore, obScore,
    candleScore, candlePattern,
    signalType,
    indicators,
  } = signalData;

  // Pattern intelligence (new fields — may be undefined on old cached responses)
  const patternStrength    = (signalData as any).patternStrength    as number  ?? 0;
  const contextValid       = (signalData as any).contextValid       as boolean ?? false;
  const confluenceMet      = (signalData as any).confluenceMet      as boolean ?? false;
  const confirmationStatus = (signalData as any).confirmationStatus as string  | null ?? null;

  const session = signalData.session;

  const isCircuitBreaker = Boolean(
    (signalData as any).circuitBreakerActive || 
    (reason && reason.toLowerCase().includes("circuit breaker"))
  );
  const circuitBreakerRemainingMinutes = (signalData as any).circuitBreakerRemainingMinutes ?? 
    (reason && reason.match(/(\d+)m cooldown/)?.[1] ? parseInt(reason.match(/(\d+)m cooldown/)![1], 10) : 0);
  const consecutiveLosses = (signalData as any).consecutiveLosses ?? 
    (reason && reason.match(/after (\d+) consecutive/)?.[1] ? parseInt(reason.match(/after (\d+) consecutive/)![1], 10) : 0);

  const signalColors = {
    LONG:  "bg-success text-success-foreground shadow-[0_0_40px_rgba(34,197,94,0.25)] border-success/50",
    SHORT: "bg-destructive text-destructive-foreground shadow-[0_0_40px_rgba(239,68,68,0.25)] border-destructive/50",
    HOLD:  "bg-warning text-warning-foreground shadow-[0_0_20px_rgba(234,179,8,0.15)] border-warning/50",
  };

  const TrendIcon = trend === "BULLISH" ? TrendingUp : trend === "BEARISH" ? TrendingDown : Minus;
  const trendColor = trend === "BULLISH" ? "text-success" : trend === "BEARISH" ? "text-destructive" : "text-muted-foreground";

  const confBarColor =
    confidence >= 80 ? "bg-amber-400" :
    confidence >= 65 ? "bg-emerald-500" :
    confidence >= 50 ? "bg-blue-500" :
    "bg-zinc-500";

  const slDist = signal === "LONG"
    ? entryPrice - stopLoss
    : signal === "SHORT"
    ? stopLoss - entryPrice
    : Math.abs(stopLoss - entryPrice);

  const rrRatio = slDist > 0 ? ((Math.abs(takeProfit - entryPrice)) / slDist).toFixed(2) : "1.50";

  return (
    <Card className="relative overflow-hidden border-border bg-gradient-to-b from-card to-background shadow-2xl">
      <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-10 pointer-events-none
        ${signal === "LONG" ? "bg-success" : signal === "SHORT" ? "bg-destructive" : "bg-warning"}`} />

      <CardContent className="p-6 lg:p-8 flex flex-col gap-5 relative z-10">

        {/* ── Quick Auto-Trading Control Bar ─────────────────────────────── */}
        <QuickAutoTrade variant="panel" />

        {/* ── Strategy Switching Selector Control (Silver Bullet / Hybrid / ORB) ── */}
        <StrategySelector variant="panel" />

        {/* ── Header: Session + Signal + Confidence ────────────────────────── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Intraday Signal · 1h/15m
              </h2>
              <SessionBadge active={session?.active} asian={session?.asian} />
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)} 
                className="ml-2 p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                title={soundEnabled ? "Mute Notifications" : "Unmute Notifications"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-sky-500" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                {refreshInterval > 0 && countdown > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline-flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5 text-amber-500" />
                    {countdown}s
                  </span>
                )}
                <button 
                  onClick={() => triggerManualRefresh(true)}
                  disabled={isFetching || isRefreshing}
                  className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
                  title={refreshInterval > 0 ? `Auto-refresh in ${countdown}s (Click for instant update)` : "Refresh Signal"}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching || isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                key={signal}
                className={`px-8 py-3 rounded-xl font-black text-3xl tracking-tight border ${signalColors[signal as keyof typeof signalColors]}`}
              >
                {signal}
              </motion.div>
              <div className="flex flex-col gap-1.5">
                {isCircuitBreaker && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                    <span className="text-xs font-bold text-red-500 tracking-wide">
                      CIRCUIT BREAKER {circuitBreakerRemainingMinutes > 0 ? `(${circuitBreakerRemainingMinutes}m)` : "ACTIVE"}
                    </span>
                  </div>
                )}
                {signalType === "RANGE" && <RangeBadge />}
                {signalType === "REVERSAL" && <ReversalBadge />}
                {signalType === "ORB_BREAKOUT" && <OrbBadge />}
                {(signalType === "ALPHA_TRADES_SD" || signalData.dualEngine?.activeEngine === "ALPHA_TRADES_SD") && <AlphaTradesBadge />}
                {signalData.dualEngine?.activeEngine === "DUAL_SYNERGY" && <DualSynergyBadge />}
                {signalStrength && <StrengthBadge strength={signalStrength} />}
                {cooldownRemaining > 0 && <CooldownTimer initialSeconds={cooldownRemaining} />}
                {(spikeCooldownRemaining ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30">
                    <Timer className="w-3.5 h-3.5 text-orange-600 dark:text-orange-600 dark:text-orange-400" />
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-600 dark:text-orange-400 tracking-wide">
                      SPIKE GUARD
                    </span>
                    <CooldownTimer initialSeconds={spikeCooldownRemaining} variant="raw" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Confidence bar */}
          <div className="flex flex-col items-end w-full md:w-auto gap-1.5">
            <div className="flex justify-between w-full md:w-52 gap-2">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <span className={`text-xs font-bold font-mono ${
                confidence >= 80 ? "text-amber-600 dark:text-amber-400" :
                confidence >= 65 ? "text-emerald-600 dark:text-emerald-400" :
                confidence >= 50 ? "text-blue-600 dark:text-blue-400" :
                "text-zinc-600 dark:text-zinc-400"
              }`}>
                {confidence}%
              </span>
            </div>
            <div className="w-full md:w-52 h-2 bg-black/40 rounded-full overflow-hidden border border-border">
              <motion.div
                className={`h-full rounded-full ${confBarColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${confidence}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <p className="text-[10px] text-zinc-700 dark:text-zinc-500 text-right">15m Structure · 1H Trend · SMC Confluence</p>
          </div>
        </div>

        {/* ── Reason / Signal Reasoning ──────────────────────────────────────── */}
        <div className="bg-black/30 border border-border rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-foreground mb-1">Signal Reasoning</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>

              {reason?.includes("Trading Paused by Performance Monitor") && (
                <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-2 text-xs text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Safety circuit breaker active.</span>
                  </div>
                  <button
                    onClick={async () => {
                      setIsResettingGuard(true);
                      try {
                        const res = await fetch("/api/performance/reset", { method: "POST" });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          toast.success(data.message || "Performance guard reset. Live trading resumed.");
                          refetch();
                          queryClient.invalidateQueries();
                        } else {
                          toast.error(data.error || "Failed to reset performance guard");
                        }
                      } catch {
                        toast.error("Failed to connect to reset endpoint");
                      } finally {
                        setIsResettingGuard(false);
                      }
                    }}
                    disabled={isResettingGuard}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black cursor-pointer shrink-0 transition-all disabled:opacity-50"
                  >
                    {isResettingGuard ? "Resetting..." : "Reset & Resume Signals"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Market Trend</span>
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${trendColor}`}>
                <TrendIcon className="w-4 h-4" />
                {trend}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Trade Duration</span>
              <span className="text-sm font-semibold text-foreground">{tradeDuration}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>Updated {timestamp ? format(new Date(timestamp), "HH:mm:ss") : "N/A"}</span>
            </div>
            <Badge variant="outline" className="text-[10px] border-border text-muted-foreground py-0 px-1.5">
              15m SMC · 1H Trend · 1:2.5+ R:R
            </Badge>
          </div>
        </div>

        {/* ── Score Breakdown ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-black/25 p-4 flex flex-col gap-2.5">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-1">Signal Score Breakdown</p>
          <ScoreBar label="EMA 9/21"        value={emaScore ?? 0}      max={35} color="bg-amber-500"   />
          <ScoreBar label="RSI (14)"        value={rsiScore ?? 0}      max={25} color="bg-blue-500"    />
          <ScoreBar label="MACD"            value={macdScore ?? 0}     max={25} color="bg-violet-500"  />
          <ScoreBar label="1m Confirm"      value={momentumScore ?? 0} max={15} color="bg-emerald-500" />
          <ScoreBar label="FVG Zone"        value={fvgScore ?? 0}      max={25} color="bg-cyan-500"    />
          <ScoreBar label="Liq. Sweep"      value={sweepScore ?? 0}    max={30} color="bg-orange-500"  />
          <ScoreBar label="Order Block"     value={obScore ?? 0}       max={25} color="bg-rose-500"    />
          <ScoreBar
            label={candlePattern ? `Candle: ${candlePattern}` : "Candle Pattern"}
            value={Math.max(0, candleScore ?? 0)}
            max={20}
            color={(candleScore ?? 0) < 0 ? "bg-red-700" : "bg-yellow-400"}
          />
          {(candleScore ?? 0) < 0 && (
            <p className="text-[10px] text-red-600/70 dark:text-red-400/70 -mt-1 pl-1">−10 pts (pattern opposes signal)</p>
          )}

          {/* ── Pattern Intelligence (shown when any pattern is active) ──────── */}
          {candlePattern && (
            <div className="mt-1 ml-1 pl-3 border-l border-yellow-400/20 flex flex-col gap-1.5">
              {/* Strength bar */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/70 w-20 flex-shrink-0">Strength</span>
                <div className="flex-1 bg-black/5 dark:bg-white/5 rounded-full h-1 overflow-hidden">
                  <motion.div
                    className={`h-1 rounded-full ${patternStrength >= 80 ? "bg-amber-400" : patternStrength >= 60 ? "bg-emerald-500" : "bg-zinc-500"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${patternStrength}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <span className="text-[10px] font-mono w-10 text-right flex-shrink-0 text-muted-foreground">{patternStrength}%</span>
              </div>
              {/* Context + Confluence + Confirmation row */}
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide border ${contextValid ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-600/70 dark:text-red-400/70"}`}>
                  {contextValid ? "✓ Context" : "✗ Context"}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide border ${confluenceMet ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400" : "bg-zinc-700/30 border-zinc-600/20 text-zinc-700 dark:text-zinc-500"}`}>
                  {confluenceMet ? "✓ Confluence" : "— Confluence"}
                </span>
                {confirmationStatus === "pending_confirmation" && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide border bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-600 dark:text-orange-400">
                    ⏳ Pending
                  </span>
                )}
                {confirmationStatus === "confirmed" && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide border bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    ✓ Confirmed
                  </span>
                )}
                {confirmationStatus === "not_applicable" && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wide border bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400">
                    ✓ Engulfing
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-border mt-0.5">
            <span className="text-[10px] text-muted-foreground">Raw score</span>
            <span className="text-sm font-bold font-mono text-foreground">
              {Math.round((confidence / 100) * 125)}
              <span className="text-muted-foreground font-normal">/125</span>
              <span className="text-muted-foreground font-normal text-[11px] ml-2">
                = {confidence}%
              </span>
            </span>
          </div>
        </div>

        {/* ── Entry / SL / TP ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-[-10px]">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {isCircuitBreaker
              ? "CIRCUIT BREAKER ACTIVE · TRADING HALTED"
              : signal === "HOLD" 
              ? (stopLoss > entryPrice ? "Preparing SHORT Setup" : "Preparing LONG Setup")
              : (signal === "SHORT" ? "Active SHORT Trade" : "Active LONG Trade")}
          </span>
        </div>
        {isCircuitBreaker && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-500 dark:text-red-400 text-xs">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
            <span>
              <strong>Capital Protection Lock:</strong> Signal generation and trade executions are strictly locked for {circuitBreakerRemainingMinutes}m {consecutiveLosses > 0 ? `after ${consecutiveLosses} consecutive stop-outs` : ""} to preserve capital. No trades will be triggered until the cooldown expires.
            </span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-black/30 border border-border rounded-xl p-3 flex flex-col items-center gap-1">
            <div 
              className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 cursor-help"
              title={signal === "LONG" ? "Buy orders enter at Ask price" : signal === "SHORT" ? "Sell orders enter at Bid price" : "Market entry price"}
            >
              <ArrowRightCircle className="w-3.5 h-3.5" /> 
              <span>Entry {signal === "LONG" ? "(Ask)" : signal === "SHORT" ? "(Bid)" : ""}</span>
            </div>
            <span className="text-sm font-bold font-mono tabular-nums">{formatPrice(entryPrice)}</span>
          </div>

          <div className={`border rounded-xl p-3 flex flex-col items-center gap-1 transition-all ${
            signal === "LONG"  ? "border-red-500/30 bg-red-500/5" :
            signal === "SHORT" ? "border-red-500/30 bg-red-500/5" :
            "border-border bg-black/30"
          }`}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <ShieldX className="w-3.5 h-3.5 text-red-600 dark:text-red-400" /> Dynamic SL
            </div>
            <span className="text-sm font-bold font-mono tabular-nums text-red-600 dark:text-red-400">{formatPrice(stopLoss)}</span>
            <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
              <span>{slDist.toFixed(2)} pts</span>
              {indicators?.atr ? (
                <span className="text-[9px] text-amber-500 font-semibold">({(slDist / indicators.atr).toFixed(1)}x ATR)</span>
              ) : null}
            </span>
          </div>

          <div className={`border rounded-xl p-3 flex flex-col items-center gap-1 transition-all ${
            signal === "LONG"  ? "border-emerald-500/30 bg-emerald-500/5" :
            signal === "SHORT" ? "border-emerald-500/30 bg-emerald-500/5" :
            "border-border bg-black/30"
          }`}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Target className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Take Profit
            </div>
            <span className="text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatPrice(takeProfit)}</span>
            <span className="text-[10px] text-muted-foreground font-mono">R:R {rrRatio}</span>
          </div>
        </div>

        {/* ── Force Trigger Running Signal on Broker Button ───────────────── */}
        {signal !== "HOLD" && !isCircuitBreaker && (
          <button
            type="button"
            onClick={handleTriggerTradeOnBroker}
            disabled={isTriggeringBroker}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 border border-emerald-400/40 disabled:opacity-50"
          >
            {isTriggeringBroker ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Dispatching Trade to MT5 Broker...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-black" />
                <span>⚡ Trigger Current {signal} Trade on Broker Now</span>
              </>
            )}
          </button>
        )}

        {/* ── Hybrid Dual-Engine Architecture Card ─────────────────────────── */}
        <div className="rounded-xl border border-border/80 bg-black/40 p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Hybrid Dual-Engine Status</span>
            </div>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              signalData?.dualEngine?.activeEngine === "DUAL_SYNERGY"
                ? "bg-amber-500/15 border-amber-500/40 text-amber-500"
                : signalData?.dualEngine?.activeEngine === "DETERMINISTIC_ORB"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : "bg-sky-500/15 border-sky-500/40 text-sky-400"
            }`}>
              {signalData?.dualEngine?.activeEngine === "DUAL_SYNERGY"
                ? "DUAL SYNERGY ACTIVE"
                : signalData?.dualEngine?.activeEngine === "DETERMINISTIC_ORB"
                ? "ORB BREAKOUT ACTIVE"
                : "ENGINE A: SMC CONFLUENCE"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-black/30 rounded-lg p-2 border border-border/50">
              <span className="text-[10px] text-muted-foreground block font-medium">Engine A (SMC Confluence)</span>
              <span className="font-semibold text-foreground">Multi-Timeframe Structure & FVG</span>
            </div>
            <div className="bg-black/30 rounded-lg p-2 border border-border/50">
              <span className="text-[10px] text-muted-foreground block font-medium">
                Engine B (Deterministic ORB)
              </span>
              <span className="font-semibold text-foreground">
                {signalData?.dualEngine?.orbStatus?.session || "Session"} {signalData?.dualEngine?.orbStatus?.stage ? `· ${String(signalData.dualEngine.orbStatus.stage).replace('_', ' ')}` : "· Active"}
              </span>
            </div>
          </div>

          {signalData?.dualEngine?.orbRange && (
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground bg-black/20 rounded-lg px-2.5 py-1.5 border border-border/30">
              <span>ORB High: <strong className="text-foreground">{formatPrice(signalData.dualEngine.orbRange.high)}</strong></span>
              <span>ORB Low: <strong className="text-foreground">{formatPrice(signalData.dualEngine.orbRange.low)}</strong></span>
              <span>Width: <strong className="text-amber-400">{signalData.dualEngine.orbRange.range.toFixed(2)} pt</strong></span>
              <span>Mid: <strong className="text-sky-400">{formatPrice(signalData.dualEngine.orbRange.mid)}</strong></span>
            </div>
          )}
        </div>

        {/* ── Volatility Shield Execution Engine Badge ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-500">
          <div className="flex items-center gap-1.5 font-medium">
            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Dynamic ATR Volatility Shield: ATR-Anchored Stop Loss · Anti-Liquidation Cushion · Structure-Protected Levels</span>
          </div>
          <span className="text-[10px] font-mono text-amber-400/90 uppercase hidden sm:inline font-bold">ATR Protected</span>
        </div>

        {/* ── Current Indicators Quick-View ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            {
              label: "EMA 9",
              value: indicators?.ema9?.toFixed(1) ?? "—",
              sub: "5m",
              color: (indicators?.ema9 ?? 0) > (indicators?.ema21 ?? 0) ? "text-success" : "text-destructive",
            },
            {
              label: "RSI (14)",
              value: indicators?.rsi?.toFixed(1) ?? "—",
              sub: "5m",
              color: (indicators?.rsi ?? 50) > 65 ? "text-destructive" :
                     (indicators?.rsi ?? 50) < 35 ? "text-success" : "text-foreground",
            },
            {
              label: "ATR",
              value: indicators?.atr?.toFixed(2) ?? "—",
              sub: "5m volatility",
              color: "text-foreground",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-black/30 border border-border rounded-xl p-3 flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground">{label}</span>
              <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
              <span className="text-[9px] text-muted-foreground/50 font-mono">{sub}</span>
            </div>
          ))}
        </div>

      </CardContent>
    </Card>
  );
}
