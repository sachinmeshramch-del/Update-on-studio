import { toast } from "sonner";
import { useState, useRef, useEffect, useMemo } from "react";
import { useGetHistory, useDeleteSignal, useClearHistory } from "@workspace/api-client-react";
import { usePriceStream } from "@/hooks/usePriceStream";
import { useRefreshInterval } from "@/hooks/useRefreshInterval";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  History, TrendingUp, TrendingDown, Clock, Trash2,
  RotateCcw, Repeat, Repeat2, ChevronDown, Check,
  ChevronLeft, ChevronRight, Calendar, Eye, Copy, CheckCheck,
  Activity, ExternalLink, Filter,
} from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { formatPrice } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function toLocalTime(ts: string) {
  try {
    return formatInTimeZone(new Date(ts), LOCAL_TZ, "dd MMM, hh:mm a");
  } catch {
    return "—";
  }
}

type TradeStatus  = "RUNNING" | "TARGET_HIT" | "STOP_HIT" | "HOLD" | "MANUALLY_CLOSED" | "CLOSED";
type SignalFilter = "ALL" | "TREND_FOLLOW" | "REVERSAL";
type OutcomeFilter = "ALL" | "WINNING" | "LOSING";
const OUTCOME_LABELS: Record<OutcomeFilter, string> = {
  ALL: "All Outcomes",
  WINNING: "Winning",
  LOSING: "Losing",
};
type Period       = "ALL" | "TODAY" | "7D" | "30D";

const PERIOD_LABELS: Record<Period, string> = {
  ALL:   "All History",
  TODAY: "Today",
  "7D":  "Last 7 days",
  "30D": "Last 30 days",
};

function periodStart(period: Period): Date | null {
  const now = new Date();
  if (period === "TODAY") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "7D") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "30D") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, pnlPoints }: { status: TradeStatus; pnlPoints?: number | null }) {
  const pts = pnlPoints ?? 0;
  if (status === "TARGET_HIT") {
    if (pts >= 6.0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap" title={`Expanded Asymmetric Runner Target Hit (+${pts.toFixed(2)} pts)`}>
          🏆 RUNNER TARGET (+{pts.toFixed(1)}p)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-success/15 text-success border border-success/30 whitespace-nowrap">
        ✅ FULL TP
      </span>
    );
  }
  if (status === "STOP_HIT") {
    if (pts >= 4.0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 whitespace-nowrap" title={`Asymmetric Runner Trailing SL (+${pts.toFixed(2)} pts banked)`}>
          🚀 RUNNER SL (+{pts.toFixed(1)}p)
        </span>
      );
    }
    if (pts > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap" title={`Trailing stop closed in profit (+${pts.toFixed(2)} pts)`}>
          🎯 TRAILING SL (+{pts.toFixed(1)}p)
        </span>
      );
    }
    if (pts === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 whitespace-nowrap" title="Trailing stop moved to break-even (0 loss)">
          🛡️ BREAK-EVEN
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-destructive/15 text-destructive border border-destructive/30 whitespace-nowrap" title={`Initial protective stop loss hit (${pts.toFixed(2)} pts)`}>
        ❌ SMALL LOSS
      </span>
    );
  }
  if (status === "MANUALLY_CLOSED" || status === "CLOSED")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30 whitespace-nowrap">
        🖐 MANUALLY CLOSED
      </span>
    );
  if (status === "RUNNING")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 animate-pulse whitespace-nowrap">
        ⏳ RUNNING
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-black/5 dark:bg-white/5 text-muted-foreground border border-border">
      — HOLD
    </span>
  );
}

function PnlCell({
  signal, status, pnlPoints, entryPrice, currentPrice,
}: {
  signal: "LONG" | "SHORT" | "HOLD";
  status: TradeStatus;
  pnlPoints?: number;
  entryPrice: number;
  currentPrice: number;
}) {
  if (signal === "HOLD") return <span className="text-muted-foreground">—</span>;

  let pts: number;
  let isClosed = false;

  if (status === "TARGET_HIT" || status === "STOP_HIT" || status === "MANUALLY_CLOSED" || status === "CLOSED") {
    pts = pnlPoints ?? 0;
    isClosed = true;
  } else {
    pts = signal === "LONG" ? currentPrice - entryPrice : entryPrice - currentPrice;
  }

  const positive = pts >= 0;
  const color = positive ? "text-success" : "text-destructive";
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span className={`inline-flex items-center gap-1 font-mono font-semibold ${color}`}>
      <Icon className="w-3 h-3" />
      {positive ? "+" : ""}{pts.toFixed(2)}
      {!isClosed && <span className="text-[10px] opacity-60 font-sans">live</span>}
    </span>
  );
}

function DurationCell({ timestamp, closedAt }: { timestamp: string; closedAt?: string }) {
  const start = timestamp ? new Date(timestamp) : new Date();
  const end = closedAt ? new Date(closedAt) : new Date();
  try {
    return (
      <span className="text-muted-foreground text-xs font-sans whitespace-nowrap">
        {formatDistanceStrict(start, end)}
      </span>
    );
  } catch {
    return <span className="text-muted-foreground">—</span>;
  }
}

function DeleteButton({ id, onDelete }: { id: string; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => onDelete(id)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30 transition-colors font-semibold"
        >
          Confirm
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-muted-foreground border border-border hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => setConfirming(true)}
      title="Delete signal"
      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/30 transition-all duration-150"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

function TypeBadge({ type }: { type?: string | null }) {
  
  
  if (type === "RANGE") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 whitespace-nowrap">
      <Repeat className="w-2.5 h-2.5" /> RANGE
    </span>
  );
  if (type === "REVERSAL") return (

    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 whitespace-nowrap">
      <RotateCcw className="w-2.5 h-2.5" /> REVERSAL
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 whitespace-nowrap">
      <Repeat2 className="w-2.5 h-2.5" /> TREND
    </span>
  );
}

// ── Period dropdown ───────────────────────────────────────────────────────────

function PeriodDropdown({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 border border-border hover:bg-black/10 dark:hover:bg-white/10 hover:border-border transition-all text-foreground"
      >
        {PERIOD_LABELS[value]}
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border">
            Period
          </div>
          {(["ALL", "TODAY", "7D", "30D"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => { onChange(p); setOpen(false); }}
              className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <span className={value === p ? "text-foreground font-semibold" : "text-muted-foreground"}>
                {PERIOD_LABELS[p]}
              </span>
              {value === p && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PnL Summary bar ───────────────────────────────────────────────────────────

interface SigRow {
  signal: "LONG" | "SHORT" | "HOLD";
  tradeStatus?: string;
  pnlPoints?: number;
  entryPrice: number;
}

function PnlSummary({ signals, currentPrice, period }: {
  signals: SigRow[];
  currentPrice: number;
  period: Period;
}) {
  const tradeable = signals.filter(s => s.signal !== "HOLD");
  const closed    = tradeable.filter(s => s.tradeStatus === "TARGET_HIT" || s.tradeStatus === "STOP_HIT");
  const wins      = closed.filter(s => s.tradeStatus === "TARGET_HIT" || (s.pnlPoints ?? 0) > 0).length;
  const runners   = closed.filter(s => (s.pnlPoints ?? 0) >= 4.0).length;
  const runnerPts = closed.filter(s => (s.pnlPoints ?? 0) >= 4.0).reduce((acc, s) => acc + (s.pnlPoints ?? 0), 0);
  const breakEven = closed.filter(s => s.tradeStatus === "STOP_HIT" && (s.pnlPoints ?? 0) === 0).length;
  const losses    = closed.filter(s => (s.pnlPoints ?? 0) < 0).length;
  const winRate   = closed.length > 0 ? Math.round((wins / closed.length) * 100) : null;

  // Sum all closed P&L + live P&L for running trades
  let totalPnl = 0;
  for (const s of tradeable) {
    if (s.tradeStatus === "TARGET_HIT" || s.tradeStatus === "STOP_HIT") {
      totalPnl += s.pnlPoints ?? 0;
    } else if (s.tradeStatus === "RUNNING" && currentPrice > 0) {
      totalPnl += s.signal === "LONG" ? currentPrice - s.entryPrice : s.entryPrice - currentPrice;
    }
  }

  const pnlPositive = totalPnl >= 0;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-black/30 border-b border-border text-xs">
      {/* Period label */}
      <span className="text-muted-foreground/60 font-semibold uppercase tracking-widest text-[10px]">
        {PERIOD_LABELS[period]}
      </span>

      <div className="w-px h-4 bg-black/10 dark:bg-white/10" />

      {/* Trade count */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Trades</span>
        <span className="font-mono font-bold text-foreground">{tradeable.length}</span>
      </div>

      <div className="w-px h-4 bg-black/10 dark:bg-white/10" />

      {/* Win / Loss / BE */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="text-success font-mono font-bold" title="Winning trades (Target Hit + Trailing Stop Profit)">{wins}W</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-destructive font-mono font-bold" title="Losing trades (Initial Stop Loss Hit)">{losses}L</span>
          {breakEven > 0 && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-cyan-400 font-mono font-bold" title="Break-even trades">{breakEven}BE</span>
            </>
          )}
        </span>
        {winRate !== null && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            winRate >= 60
              ? "bg-success/10 text-success border-success/30"
              : winRate >= 45
              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
              : "bg-destructive/10 text-destructive border-destructive/30"
          }`}>
            {winRate}% WR
          </span>
        )}
      </div>

      {/* Runners highlight (Asymmetric Expectancy) */}
      {runners > 0 && (
        <>
          <div className="w-px h-4 bg-black/10 dark:bg-white/10" />
          <div className="flex items-center gap-1.5" title={`Runners gained +${runnerPts.toFixed(1)} pts to pay for small losses`}>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              🚀 {runners} {runners === 1 ? "Runner" : "Runners"}
            </span>
            <span className="font-mono text-emerald-300 font-semibold">(+{runnerPts.toFixed(1)}p)</span>
          </div>
        </>
      )}

      <div className="w-px h-4 bg-black/10 dark:bg-white/10" />

      {/* Total P&L */}
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-muted-foreground">Net P&amp;L</span>
        <span className={`flex items-center gap-1 font-mono font-bold text-sm ${pnlPositive ? "text-success" : "text-destructive"}`}>
          {pnlPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {pnlPositive ? "+" : ""}{totalPnl.toFixed(2)} pts
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────


function OutcomeDropdown({ value, onChange }: { value: OutcomeFilter; onChange: (o: OutcomeFilter) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 border border-border hover:bg-black/10 dark:hover:bg-white/10 hover:border-border transition-all text-foreground"
      >
        {OUTCOME_LABELS[value]}
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border">
            Outcome
          </div>
          {(["ALL", "WINNING", "LOSING"] as OutcomeFilter[]).map(o => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false); }}
              className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <span className={value === o ? "text-foreground font-semibold" : "text-muted-foreground"}>
                {OUTCOME_LABELS[o]}
              </span>
              {value === o && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Today's Full Trades Log Modal ─────────────────────────────────────────────

interface TodayTradesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trades: any[];
  currentPrice: number;
  onDelete: (id: string) => void;
  onRefetch: () => void;
}

function TodayTradesModal({
  open,
  onOpenChange,
  trades,
  currentPrice,
  onDelete,
  onRefetch,
}: TodayTradesModalProps) {
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT" | "WINNERS" | "LOSERS" | "RUNNING">("ALL");
  const [copied, setCopied] = useState(false);

  const todayDateStr = useMemo(() => {
    try {
      return formatInTimeZone(new Date(), LOCAL_TZ, "EEEE, dd MMMM yyyy");
    } catch {
      return "Today";
    }
  }, []);

  // Compute Today's statistics
  const closed = trades.filter(t => t.tradeStatus === "TARGET_HIT" || t.tradeStatus === "STOP_HIT");
  const wins = closed.filter(t => t.tradeStatus === "TARGET_HIT" || (t.pnlPoints ?? 0) > 0).length;
  const losses = closed.filter(t => t.tradeStatus === "STOP_HIT" && (t.pnlPoints ?? 0) < 0).length;
  const breakEven = closed.filter(t => t.tradeStatus === "STOP_HIT" && (t.pnlPoints ?? 0) === 0).length;
  const running = trades.filter(t => t.tradeStatus === "RUNNING").length;
  const runners = closed.filter(t => (t.pnlPoints ?? 0) >= 4.0).length;
  const runnerPts = closed.filter(t => (t.pnlPoints ?? 0) >= 4.0).reduce((acc, t) => acc + (t.pnlPoints ?? 0), 0);
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : null;

  let totalPnl = 0;
  for (const t of trades) {
    if (t.tradeStatus === "TARGET_HIT" || t.tradeStatus === "STOP_HIT") {
      totalPnl += t.pnlPoints ?? 0;
    } else if (t.tradeStatus === "RUNNING" && currentPrice > 0) {
      totalPnl += t.signal === "LONG" ? currentPrice - t.entryPrice : t.entryPrice - currentPrice;
    }
  }
  const pnlPositive = totalPnl >= 0;

  const longCount = trades.filter(t => t.signal === "LONG").length;
  const shortCount = trades.filter(t => t.signal === "SHORT").length;

  // Filtered trade list
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (filter === "LONG") return t.signal === "LONG";
      if (filter === "SHORT") return t.signal === "SHORT";
      if (filter === "RUNNING") return t.tradeStatus === "RUNNING";
      if (filter === "WINNERS") {
        const pts = (t.tradeStatus === "TARGET_HIT" || t.tradeStatus === "STOP_HIT")
          ? (t.pnlPoints ?? 0)
          : (t.signal === "LONG" ? currentPrice - t.entryPrice : t.entryPrice - currentPrice);
        return pts > 0;
      }
      if (filter === "LOSERS") {
        const pts = (t.tradeStatus === "TARGET_HIT" || t.tradeStatus === "STOP_HIT")
          ? (t.pnlPoints ?? 0)
          : (t.signal === "LONG" ? currentPrice - t.entryPrice : t.entryPrice - currentPrice);
        return pts < 0;
      }
      return true;
    });
  }, [trades, filter, currentPrice]);

  function handleCopySummary() {
    const lines = [
      `📊 XAUUSD Gold Intraday – Today's Trading Activity (${todayDateStr})`,
      `Total Trades Triggered: ${trades.length} (${longCount} Long / ${shortCount} Short)`,
      `Performance: ${wins}W / ${losses}L / ${breakEven}BE ${winRate !== null ? `(${winRate}% Win Rate)` : ""}`,
      `Net Realized / Live P&L: ${pnlPositive ? "+" : ""}${totalPnl.toFixed(2)} pts`,
      runners > 0 ? `Runners Banked: ${runners} trade(s) (+${runnerPts.toFixed(1)} pts)` : "",
      `------------------------------------------------------------`,
      ...trades.map((t, idx) => {
        const time = toLocalTime(t.timestamp);
        let pts = t.pnlPoints ?? 0;
        if (t.tradeStatus === "RUNNING" && currentPrice > 0) {
          pts = t.signal === "LONG" ? currentPrice - t.entryPrice : t.entryPrice - currentPrice;
        }
        const ptsStr = pts >= 0 ? `+${pts.toFixed(2)}` : pts.toFixed(2);
        return `#${idx + 1} [${time}] ${t.signal} (${t.signalType ?? "TREND"}) | Entry: ${formatPrice(t.entryPrice)} | SL: ${formatPrice(t.stopLoss)} | TP: ${formatPrice(t.takeProfit)} | PnL: ${ptsStr} pts | Status: ${t.tradeStatus ?? "RUNNING"}`;
      }),
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    toast.success("Today's trades summary copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0 bg-background border-border overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 border-b border-border bg-black/20 flex-shrink-0">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-500" />
                <DialogTitle className="text-lg font-bold text-foreground">
                  Today&apos;s Trade Activity Log
                </DialogTitle>
                <Badge variant="outline" className="text-[11px] font-mono border-amber-500/40 text-amber-400 bg-amber-500/10">
                  {trades.length} {trades.length === 1 ? "Trade" : "Trades"}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                {todayDateStr} · All signals executed and monitored today in IST
              </DialogDescription>
            </div>

            {trades.length > 0 && (
              <button
                onClick={handleCopySummary}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 border border-border hover:bg-black/10 dark:hover:bg-white/10 text-foreground transition-all"
                title="Copy formatted summary to clipboard"
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                {copied ? "Copied" : "Copy Summary"}
              </button>
            )}
          </div>

          {/* Quick Metrics Bar */}
          {trades.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <div className="bg-black/30 border border-border rounded-lg p-2.5">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">Today&apos;s P&amp;L</span>
                <span className={`text-base font-bold font-mono flex items-center gap-1 mt-0.5 ${pnlPositive ? "text-success" : "text-destructive"}`}>
                  {pnlPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {pnlPositive ? "+" : ""}{totalPnl.toFixed(2)} pts
                </span>
              </div>

              <div className="bg-black/30 border border-border rounded-lg p-2.5">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">Win Rate</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-base font-bold font-mono text-foreground">
                    {winRate !== null ? `${winRate}%` : "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({wins}W / {losses}L{breakEven > 0 ? ` / ${breakEven}BE` : ""})
                  </span>
                </div>
              </div>

              <div className="bg-black/30 border border-border rounded-lg p-2.5">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">Volume &amp; Bias</span>
                <div className="flex items-center gap-2 mt-0.5 text-xs font-semibold">
                  <span className="text-emerald-400 font-mono">{longCount} Long</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-rose-400 font-mono">{shortCount} Short</span>
                </div>
              </div>

              <div className="bg-black/30 border border-border rounded-lg p-2.5">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">Active Positions</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-base font-bold font-mono ${running > 0 ? "text-amber-400 animate-pulse" : "text-muted-foreground"}`}>
                    {running}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {running > 0 ? "Running live" : "All completed"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Filter Chips inside Modal */}
          {trades.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1 text-xs">
              <span className="text-[11px] text-muted-foreground/70 font-semibold mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filter:
              </span>
              {(
                [
                  { id: "ALL", label: `All (${trades.length})` },
                  { id: "LONG", label: `Longs (${longCount})` },
                  { id: "SHORT", label: `Shorts (${shortCount})` },
                  { id: "WINNERS", label: `Winners (${wins})` },
                  { id: "LOSERS", label: `Losses (${losses})` },
                  { id: "RUNNING", label: `Running (${running})` },
                ] as const
              ).map(item => (
                <button
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap ${
                    filter === item.id
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-black/10 dark:bg-white/5 text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {trades.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-foreground">No Trades Triggered Today Yet</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                The algorithmic scanner is actively monitoring the London and New York sessions for 5-minute confluence setups.
              </p>
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-xs text-muted-foreground">No trades match the selected filter &ldquo;{filter}&rdquo;.</p>
            </div>
          ) : (
            filteredTrades.map((row, idx) => {
              const status = (row.tradeStatus ?? "RUNNING") as TradeStatus;
              let pts: number;
              if (status === "TARGET_HIT" || status === "STOP_HIT" || status === "MANUALLY_CLOSED" || status === "CLOSED") {
                pts = row.pnlPoints ?? 0;
              } else {
                pts = row.signal === "LONG" ? currentPrice - row.entryPrice : row.entryPrice - currentPrice;
              }
              const isProfit = pts >= 0;

              return (
                <div
                  key={row.id || idx}
                  className="p-3.5 rounded-xl border border-border bg-black/20 hover:bg-black/30 transition-all flex flex-col gap-2.5 group"
                >
                  {/* Top line: Time, Signal, Type, Status, PnL */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-semibold text-foreground">
                        {toLocalTime(row.timestamp)}
                      </span>
                      <Badge variant={
                        row.signal === "LONG" ? "success" :
                        row.signal === "SHORT" ? "destructive" : "warning"
                      }>
                        {row.signal}
                      </Badge>
                      <TypeBadge type={(row as any).signalType} />
                      <StatusBadge status={status} pnlPoints={row.pnlPoints} />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className={`font-mono font-bold text-sm flex items-center gap-1 ${isProfit ? "text-success" : "text-destructive"}`}>
                          {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {isProfit ? "+" : ""}{pts.toFixed(2)} pts
                        </span>
                      </div>
                      <DeleteButton id={row.id} onDelete={onDelete} />
                    </div>
                  </div>

                  {/* Pricing and parameters mini-grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-black/30 p-2.5 rounded-lg border border-white/5 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-sans block">Entry Price</span>
                      <span className="font-semibold text-foreground">{formatPrice(row.entryPrice)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-destructive uppercase font-sans block">Stop Loss</span>
                      <span className="font-semibold text-destructive/90">{formatPrice(row.stopLoss)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-success uppercase font-sans block">Take Profit</span>
                      <span className="font-semibold text-success/90">{formatPrice(row.takeProfit)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-sans block">Duration / Conf.</span>
                      <div className="flex items-center gap-1.5 text-slate-200">
                        <DurationCell timestamp={row.timestamp} closedAt={row.closedAt} />
                        <span className="text-muted-foreground">·</span>
                        <span>{row.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Reason & Action note if applicable */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    {row.reason ? (
                      <p className="text-[11px] text-muted-foreground italic line-clamp-1 flex-1">
                        💡 {row.reason}
                      </p>
                    ) : (
                      <div />
                    )}

                    {status === "RUNNING" && (
                      <button
                        onClick={() => setTradeToClose(row.id)}
                        className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase text-white bg-red-600/80 hover:bg-red-500 rounded-md transition-colors shadow-sm flex-shrink-0"
                      >
                        Close Trade
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main History Table Component ──────────────────────────────────────────────

export function HistoryTable() {
  const { refreshInterval } = useRefreshInterval();
  const { data, isLoading, isError, refetch } = useGetHistory({
    query: {
      refetchInterval: refreshInterval > 0 ? Math.max(refreshInterval, 5000) : false,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: refreshInterval > 0 ? Math.min(3000, Math.floor(refreshInterval * 0.7)) : 0,
    } as any,
  });
  const { data: priceData } = usePriceStream();
  const currentPrice = priceData?.price ?? 0;

  const { mutate: deleteSignal } = useDeleteSignal();
  const { mutate: clearHistory, isPending: isClearing } = useClearHistory();
  const [confirmClear, setConfirmClear] = useState(false);
  const [tradeToClose, setTradeToClose] = useState<string | null>(null);
  const [isClosingTrade, setIsClosingTrade] = useState(false);
  const [typeFilter, setTypeFilter]     = useState<SignalFilter>("ALL");
  const [period, setPeriod]             = useState<Period>("TODAY");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("ALL");

  // Compact pagination state (Default 5 trades at a time)
  const [pageSize, setPageSize]       = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isTodayModalOpen, setIsTodayModalOpen] = useState<boolean>(false);

  // Reset page to 1 when filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, period, outcomeFilter, pageSize]);

  function handleDelete(id: string) {
    deleteSignal(
      { id },
      { onSuccess: () => refetch(), onError: () => refetch() }
    );
  }

  function handleClearAll() {
    clearHistory(undefined, {
      onSuccess: () => { refetch(); setConfirmClear(false); },
      onError:   () => setConfirmClear(false),
    });
  }

  if (isError) return null;

  const allSignals = data?.signals ?? [];

  // Filter today's trades specifically for the dedicated whole-day viewer
  const todayCutoff = periodStart("TODAY");
  const todayTrades = todayCutoff
    ? allSignals.filter((s: any) => s.timestamp && new Date(s.timestamp) >= todayCutoff && s.signal !== "HOLD")
    : [];

  // Period filter for the table
  const cutoff = periodStart(period);
  const periodSignals = cutoff
    ? allSignals.filter((s: any) => s.timestamp && new Date(s.timestamp) >= cutoff)
    : allSignals;

  // Type filter
  let signals = typeFilter === "ALL"
    ? periodSignals
    : periodSignals.filter((s: any) => (s as any).signalType === typeFilter);

  // Outcome filter
  if (outcomeFilter !== "ALL") {
    signals = signals.filter((s: any) => {
      if (s.signal === "HOLD") return false;
      let pts = 0;
      const status = (s.tradeStatus ?? "RUNNING") as TradeStatus;
      if (status === "TARGET_HIT" || status === "STOP_HIT") {
        pts = s.pnlPoints ?? 0;
      } else {
        pts = s.signal === "LONG" ? currentPrice - s.entryPrice : s.entryPrice - currentPrice;
      }
      return outcomeFilter === "WINNING" ? pts > 0 : pts <= 0;
    });
  }

  // ── Pagination Calculation ──────────────────────────────────────────────────
  const totalTrades   = signals.length;
  const totalPages    = Math.max(1, Math.ceil(totalTrades / pageSize));
  const activePage    = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex    = (activePage - 1) * pageSize;
  const endIndex      = Math.min(startIndex + pageSize, totalTrades);
  const displayedRows = signals.slice(startIndex, endIndex);

  return (
    <>
      {/* Dedicated Today's Trades Activity Modal */}
      <TodayTradesModal
        open={isTodayModalOpen}
        onOpenChange={setIsTodayModalOpen}
        trades={todayTrades}
        currentPrice={currentPrice}
        onDelete={handleDelete}
        onRefetch={refetch}
      />

      <Card className="border-border bg-card/50 overflow-hidden shadow-sm">
        <CardHeader className="py-3 px-3 sm:px-5 border-b border-border bg-black/20">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap gap-y-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
              <span>Signal History</span>
              <span className="text-[11px] font-normal text-muted-foreground/60 font-mono">(IST · latest first)</span>
            </div>

            {/* Quick Button: View All Today's Trades */}
            <button
              onClick={() => setIsTodayModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-all shadow-sm active:scale-95 ml-1"
              title="Open full-day breakdown of all trades triggered today"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Today&apos;s Trades</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                {todayTrades.length}
              </span>
            </button>

            {/* Type filter tabs */}
            <div className="flex items-center gap-1 ml-0 sm:ml-1">
              {(["ALL", "TREND_FOLLOW", "REVERSAL"] as SignalFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                    typeFilter === f
                      ? f === "REVERSAL"
                        ? "bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/40"
                        : f === "TREND_FOLLOW"
                        ? "bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40"
                        : "bg-black/10 dark:bg-white/10 text-foreground border border-border"
                      : "text-muted-foreground border border-transparent hover:border-border hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  {f === "TREND_FOLLOW" ? "Trend" : f === "REVERSAL" ? "⟳ Reversal" : "All"}
                  {f !== "ALL" && (
                    <span className="ml-1 opacity-60">
                      ({periodSignals.filter(s => (s as any).signalType === f).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-wrap">
              {/* Outcome picker */}
              <OutcomeDropdown value={outcomeFilter} onChange={setOutcomeFilter} />
              {/* Period picker */}
              <PeriodDropdown value={period} onChange={setPeriod} />

              {currentPrice > 0 && (
                <span 
                  className="hidden sm:inline-block text-xs font-mono font-normal text-muted-foreground cursor-help"
                  title={priceData ? `Live Mid Price: $${priceData.price.toFixed(2)} | Bid: $${priceData.bid.toFixed(2)} | Ask: $${priceData.ask.toFixed(2)}` : undefined}
                >
                  Live (Mid): <span className="text-foreground font-semibold">{formatPrice(currentPrice)}</span>
                </span>
              )}

              {/* Clear All button */}
              {signals.length > 0 && (
                confirmClear ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Clear all {allSignals.length}?</span>
                    <button
                      onClick={handleClearAll}
                      disabled={isClearing}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-colors disabled:opacity-50"
                    >
                      {isClearing ? "Clearing…" : "Yes, Clear"}
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="px-2 py-1 rounded-md text-xs font-semibold bg-black/5 dark:bg-white/5 text-muted-foreground border border-border hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground border border-border hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-all duration-150"
                    title="Clear history records"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {/* ── PnL Summary bar ── */}
          {!isLoading && periodSignals.length > 0 && (
            <PnlSummary
              signals={periodSignals as SigRow[]}
              currentPrice={currentPrice}
              period={period}
            />
          )}

          {/* Compact Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left">
              <thead className="text-[11px] text-muted-foreground uppercase bg-black/40 border-b border-border">
                <tr>
                  <th className="px-3 py-2 font-semibold tracking-wider whitespace-nowrap">Date &amp; Time (IST)</th>
                  <th className="px-3 py-2 font-semibold tracking-wider">Signal</th>
                  <th className="px-3 py-2 font-semibold tracking-wider">Type</th>
                  <th className="px-3 py-2 font-semibold tracking-wider">Status</th>
                  <th className="px-3 py-2 font-semibold tracking-wider whitespace-nowrap">Entry</th>
                  <th className="px-3 py-2 font-semibold tracking-wider whitespace-nowrap">Stop Loss</th>
                  <th className="px-3 py-2 font-semibold tracking-wider whitespace-nowrap">Take Profit</th>
                  <th className="px-3 py-2 font-semibold tracking-wider whitespace-nowrap">P&amp;L (pts)</th>
                  <th className="px-3 py-2 font-semibold tracking-wider whitespace-nowrap">Duration</th>
                  <th className="px-3 py-2 font-semibold tracking-wider">Conf.</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <Skeleton className="h-4 w-16 bg-black/5 dark:bg-white/5" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  displayedRows.map((row) => {
                    const status = (row.tradeStatus ?? "RUNNING") as TradeStatus;
                    return (
                      <tr key={row.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                        <td className="px-3 py-2.5 text-slate-200 text-xs whitespace-nowrap font-mono">
                          {toLocalTime(row.timestamp)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={
                            row.signal === "LONG" ? "success" :
                            row.signal === "SHORT" ? "destructive" : "warning"
                          }>
                            {row.signal}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <TypeBadge type={(row as any).signalType} />
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={status} pnlPoints={row.pnlPoints} />
                            {status === "RUNNING" && (
                              <button
                                onClick={() => setTradeToClose(row.id)}
                                className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-white bg-red-600/80 hover:bg-red-500 rounded-md transition-colors shadow-sm"
                              >
                                Close
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-foreground font-semibold">
                          {formatPrice(row.entryPrice)}
                        </td>
                        <td className="px-3 py-2.5 text-destructive/80">
                          {formatPrice(row.stopLoss)}
                        </td>
                        <td className="px-3 py-2.5 text-success/80">
                          {formatPrice(row.takeProfit)}
                        </td>
                        <td className="px-3 py-2.5">
                          <PnlCell
                            signal={row.signal}
                            status={status}
                            pnlPoints={row.pnlPoints}
                            entryPrice={row.entryPrice}
                            currentPrice={currentPrice}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <DurationCell timestamp={row.timestamp} closedAt={row.closedAt} />
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-200">
                          {row.confidence}%
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <DeleteButton id={row.id} onDelete={handleDelete} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {signals.length === 0 && !isLoading && (
              <div className="p-8 text-center text-muted-foreground text-xs">
                {period !== "ALL"
                  ? `No signals for ${PERIOD_LABELS[period].toLowerCase()}. Try "All History" to see everything.`
                  : "No signal history yet. Signals will appear here once generated."}
              </div>
            )}
          </div>

          {/* ── User-Friendly Compact Pagination & Today's Link Footer ── */}
          {signals.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-black/30 border-t border-border text-xs">
              {/* Left: Count summary & page size toggle */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-muted-foreground">
                  Showing <span className="font-semibold text-foreground font-mono">{totalTrades > 0 ? startIndex + 1 : 0}–{endIndex}</span> of <span className="font-semibold text-foreground font-mono">{totalTrades}</span> trades
                </span>

                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span>Show:</span>
                  {[5, 10, 25, 50, 1000].map(n => (
                    <button
                      key={n}
                      onClick={() => setPageSize(n)}
                      className={`px-2 py-0.5 rounded font-mono font-semibold transition-colors ${
                        pageSize === n
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-black/10 dark:bg-white/5 text-muted-foreground hover:text-foreground border border-border"
                      }`}
                    >
                      {n === 1000 ? "All" : n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Page navigation buttons + Quick Today trigger */}
              <div className="flex items-center gap-2 flex-wrap ml-auto">
                <button
                  onClick={() => setIsTodayModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 hover:underline transition-all mr-2"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View All Today ({todayTrades.length})
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={activePage <= 1}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-black/5 dark:bg-white/5 border border-border hover:bg-black/10 dark:hover:bg-white/10 text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  <span className="px-2.5 py-1 text-xs font-mono text-muted-foreground">
                    Page <span className="font-bold text-foreground">{activePage}</span> of <span className="font-bold text-foreground">{totalPages}</span>
                  </span>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={activePage >= totalPages}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-black/5 dark:bg-white/5 border border-border hover:bg-black/10 dark:hover:bg-white/10 text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!tradeToClose} onOpenChange={(o) => { if (!o) setTradeToClose(null); }}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Force Close Trade</DialogTitle>
            <DialogDescription>
              Are you sure you want to forcefully close this trade at the current market price? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setTradeToClose(null)}
              className="px-4 py-2 text-sm font-semibold text-foreground bg-secondary rounded-lg hover:bg-secondary/80"
              disabled={isClosingTrade}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!tradeToClose) return;
                setIsClosingTrade(true);
                try {
                  const res = await fetch(`/api/signals/${tradeToClose}/close`, { method: "POST" });
                  if (!res.ok) throw new Error("Failed to close");
                  toast.success("Trade manually closed successfully!");
                  refetch();
                  setTradeToClose(null);
                } catch (e) {
                  toast.error("Failed to close trade.");
                } finally {
                  setIsClosingTrade(false);
                }
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-500 disabled:opacity-50 flex items-center gap-2"
              disabled={isClosingTrade}
            >
              {isClosingTrade ? "Closing..." : "Close Trade"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
