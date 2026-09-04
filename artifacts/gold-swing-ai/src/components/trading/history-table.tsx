import { useState, useRef, useEffect } from "react";
import { useGetHistory, useDeleteSignal, useClearHistory } from "@workspace/api-client-react";
import { usePriceStream } from "@/hooks/usePriceStream";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  History, TrendingUp, TrendingDown, Clock, Trash2,
  RotateCcw, Repeat, Repeat2, ChevronDown, Check,
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

type TradeStatus  = "RUNNING" | "TARGET_HIT" | "STOP_HIT" | "HOLD";
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

function StatusBadge({ status }: { status: TradeStatus }) {
  if (status === "TARGET_HIT")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-success/15 text-success border border-success/30 whitespace-nowrap">
        ✅ TARGET HIT
      </span>
    );
  if (status === "STOP_HIT")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-destructive/15 text-destructive border border-destructive/30 whitespace-nowrap">
        ❌ STOP LOSS
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

  if (status === "TARGET_HIT" || status === "STOP_HIT") {
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
  const wins      = closed.filter(s => s.tradeStatus === "TARGET_HIT").length;
  const losses    = closed.filter(s => s.tradeStatus === "STOP_HIT").length;
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

      {/* Win / Loss */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="text-success font-mono font-bold">{wins}W</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-destructive font-mono font-bold">{losses}L</span>
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

export function HistoryTable() {
  const { data, isLoading, isError, refetch } = useGetHistory({
    query: { refetchInterval: 10000 } as any,
  });
  const { data: priceData } = usePriceStream();
  const currentPrice = priceData?.price ?? 0;

  const { mutate: deleteSignal } = useDeleteSignal();
  const { mutate: clearHistory, isPending: isClearing } = useClearHistory();
  const [confirmClear, setConfirmClear] = useState(false);
  const [typeFilter, setTypeFilter]     = useState<SignalFilter>("ALL");
  const [period, setPeriod]             = useState<Period>("TODAY");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("ALL");

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

  // Period filter
  const cutoff = periodStart(period);
  const periodSignals = cutoff
    ? allSignals.filter(s => s.timestamp && new Date(s.timestamp) >= cutoff)
    : allSignals;

  // Type filter
  let signals = typeFilter === "ALL"
    ? periodSignals
    : periodSignals.filter(s => (s as any).signalType === typeFilter);

  // Outcome filter
  if (outcomeFilter !== "ALL") {
    signals = signals.filter(s => {
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

  return (
    <Card className="border-border bg-card/50 overflow-hidden">
      <CardHeader className="pb-4 border-b border-border bg-black/20">
        <CardTitle className="text-lg flex items-center gap-2 flex-wrap gap-y-2">
          <History className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          Signal History
          <span className="text-xs font-normal text-muted-foreground/60 font-mono">(IST · latest first)</span>

          {/* Type filter tabs */}
          <div className="flex items-center gap-1 ml-1">
            {(["ALL", "TREND_FOLLOW", "REVERSAL"] as SignalFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
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

          <div className="ml-auto flex items-center gap-3">
            {/* Outcome picker */}
            <OutcomeDropdown value={outcomeFilter} onChange={setOutcomeFilter} />
            {/* Period picker */}
            <PeriodDropdown value={period} onChange={setPeriod} />

            {currentPrice > 0 && (
              <span className="text-xs font-mono font-normal text-muted-foreground">
                Live: <span className="text-foreground">{formatPrice(currentPrice)}</span>
              </span>
            )}

            {/* Clear All button */}
            {signals.length > 0 && (
              confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Clear all {allSignals.length} records?</span>
                  <button
                    onClick={handleClearAll}
                    disabled={isClearing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-colors disabled:opacity-50"
                  >
                    {isClearing ? "Clearing…" : "Yes, Clear All"}
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 text-muted-foreground border border-border hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-border hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-all duration-150"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear History
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

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Date &amp; Time (IST)</th>
                <th className="px-4 py-3 font-semibold tracking-wider">Signal</th>
                <th className="px-4 py-3 font-semibold tracking-wider">Type</th>
                <th className="px-4 py-3 font-semibold tracking-wider">Status</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Entry</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Stop Loss</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Take Profit</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">P&amp;L (pts)</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Duration</th>
                <th className="px-4 py-3 font-semibold tracking-wider">Conf.</th>
                <th className="px-4 py-3 font-semibold tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-16 bg-black/5 dark:bg-white/5" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                signals.map((row) => {
                  const status = (row.tradeStatus ?? "RUNNING") as TradeStatus;
                  return (
                    <tr key={row.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 text-slate-200 text-xs whitespace-nowrap font-mono">
                        {toLocalTime(row.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={
                          row.signal === "LONG" ? "success" :
                          row.signal === "SHORT" ? "destructive" : "warning"
                        }>
                          {row.signal}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <TypeBadge type={(row as any).signalType} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={status} />
                          {status === "RUNNING" && (
                            <button
                              onClick={async () => {
                                if (!confirm("Are you sure you want to forcefully close this trade at the current market price?")) return;
                                try {
                                  const res = await fetch(`/api/signals/${row.id}/close`, { method: "POST" });
                                  if (!res.ok) throw new Error("Failed to close");
                                  toast.success("Trade manually closed successfully!");
                                } catch (e) {
                                  toast.error("Failed to close trade.");
                                }
                              }}
                              className="px-2 py-1 text-[10px] font-bold tracking-wider uppercase text-white bg-red-600/80 hover:bg-red-500 rounded-md transition-colors shadow-sm"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground font-semibold">
                        {formatPrice(row.entryPrice)}
                      </td>
                      <td className="px-4 py-3 text-destructive/80">
                        {formatPrice(row.stopLoss)}
                      </td>
                      <td className="px-4 py-3 text-success/80">
                        {formatPrice(row.takeProfit)}
                      </td>
                      <td className="px-4 py-3">
                        <PnlCell
                          signal={row.signal}
                          status={status}
                          pnlPoints={row.pnlPoints}
                          entryPrice={row.entryPrice}
                          currentPrice={currentPrice}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <DurationCell timestamp={row.timestamp} closedAt={row.closedAt} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        {row.confidence}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DeleteButton id={row.id} onDelete={handleDelete} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {signals.length === 0 && !isLoading && (
            <div className="p-8 text-center text-muted-foreground">
              {period !== "ALL"
                ? `No signals for ${PERIOD_LABELS[period].toLowerCase()}. Try "All History" to see everything.`
                : "No signal history yet. Signals will appear here once generated."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
