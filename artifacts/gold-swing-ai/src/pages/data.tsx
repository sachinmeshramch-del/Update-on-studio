import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Database,
  RefreshCw,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ShieldCheck,
  FileSpreadsheet,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Activity,
  HardDrive,
  Info,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface TimeframeCoverage {
  symbol: string;
  timeframe: string;
  candleCount: number;
  firstCandleUTC: string | null;
  lastCandleUTC: string | null;
  gapCount: number;
  freshnessMinutes: number;
  dataQuality: "EXCELLENT" | "GOOD" | "GAPS_DETECTED" | "EMPTY";
}

export default function DataPage() {
  const [activeTimeframe, setActiveTimeframe] = useState<string>("5m");
  const [syncCount, setSyncCount] = useState<number>(1000);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Coverage summaries for 1m, 5m, 15m
  const [coverages, setCoverages] = useState<Record<string, TimeframeCoverage>>({});
  const [isLoadingCoverage, setIsLoadingCoverage] = useState<boolean>(true);

  // CSV Import State
  const [csvText, setCsvText] = useState<string>("");
  const [isImportingCsv, setIsImportingCsv] = useState<boolean>(false);
  const [csvImportResult, setCsvImportResult] = useState<{
    success: boolean;
    importedCount?: number;
    totalRows?: number;
    skippedCount?: number;
    error?: string;
  } | null>(null);

  // Load coverage summaries
  const fetchAllCoverage = async () => {
    setIsLoadingCoverage(true);
    const timeframes = ["1m", "5m", "15m"];
    const results: Record<string, TimeframeCoverage> = {};

    for (const tf of timeframes) {
      try {
        const res = await fetch(`/api/history/candles/summary?symbol=XAUUSD&timeframe=${tf}`);
        if (res.ok) {
          const data = await res.json();
          results[tf] = data?.coverage || data || {
            symbol: "XAUUSD",
            timeframe: tf,
            candleCount: 0,
            firstCandleUTC: null,
            lastCandleUTC: null,
            gapCount: 0,
            freshnessMinutes: 0,
            dataQuality: "EMPTY",
          };
        }
      } catch (e) {
        console.error(`Failed to load coverage for ${tf}`, e);
      }
    }

    setCoverages(results);
    setIsLoadingCoverage(false);
  };

  useEffect(() => {
    fetchAllCoverage();
  }, []);

  // Trigger MetaApi sync
  const handleSyncMetaApi = async () => {
    setIsSyncing(true);
    setSyncStatusMsg(`Connecting to MetaApi cloud feed for ${activeTimeframe} (${syncCount} candles)...`);

    try {
      const res = await fetch("/api/history/candles/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeframe: activeTimeframe,
          count: syncCount,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Sync request failed");
      }

      toast.success(`Successfully synchronized ${data.importedCount || syncCount} ${activeTimeframe} candles!`);
      setSyncStatusMsg(`Sync complete: ${data.importedCount || syncCount} candles verified.`);
      fetchAllCoverage();
    } catch (err: any) {
      toast.error(err.message || "Historical sync failed");
      setSyncStatusMsg(`Error: ${err.message || "Failed to sync"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle CSV file selection
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvText(content);
        toast.info(`Loaded ${file.name} (${Math.round(content.length / 1024)} KB). Ready to validate and import.`);
      }
    };
    reader.readAsText(file);
  };

  // Submit CSV
  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      toast.error("Please paste CSV data or select a file first");
      return;
    }

    setIsImportingCsv(true);
    setCsvImportResult(null);

    try {
      const res = await fetch("/api/history/candles/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          symbol: "XAUUSD",
          timeframe: activeTimeframe,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to import CSV");
      }

      setCsvImportResult(data);
      toast.success(`Imported ${data.importedCount} valid candles into historical repository!`);
      fetchAllCoverage();
    } catch (err: any) {
      toast.error(err.message || "CSV Import error");
      setCsvImportResult({ success: false, error: err.message });
    } finally {
      setIsImportingCsv(false);
    }
  };

  const currentCoverage = coverages[activeTimeframe];

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Header />

      <main className="flex-grow container mx-auto px-2 sm:px-4 py-4 md:py-6 flex flex-col gap-6">
        {/* Page Title & Status Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Database className="w-4 h-4 text-amber-500" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Historical Market Data Manager
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Persistent UTC-stamped OHLCV storage, automated MetaApi cloud ingestion, and audit verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAllCoverage}
              disabled={isLoadingCoverage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-accent transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCoverage ? "animate-spin text-amber-500" : ""}`} />
              Refresh Coverage
            </button>
          </div>
        </div>

        {/* ── Timeframe Coverage Cards ────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {["1m", "5m", "15m"].map((tf) => {
            const cov = coverages[tf];
            const isSelected = activeTimeframe === tf;

            return (
              <Card
                key={tf}
                onClick={() => setActiveTimeframe(tf)}
                className={`cursor-pointer transition-all border ${
                  isSelected
                    ? "border-amber-500/50 bg-amber-500/5 shadow-md shadow-amber-500/5"
                    : "border-border hover:border-border/80 bg-card"
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono font-bold text-xs uppercase px-2 py-0.5">
                        {tf}
                      </Badge>
                      <span className="text-xs font-mono font-semibold text-foreground">XAUUSD</span>
                    </div>
                    {cov ? (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-mono uppercase ${
                          cov.dataQuality === "EXCELLENT"
                            ? "bg-green-500/10 text-green-500 border border-green-500/30"
                            : cov.dataQuality === "GOOD"
                            ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                            : "bg-red-500/10 text-red-500 border border-red-500/30"
                        }`}
                      >
                        {cov.dataQuality}
                      </Badge>
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground">Checking...</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">Stored Candles:</span>
                    <span className="text-lg font-mono font-bold text-foreground">
                      {cov ? (cov.candleCount ?? 0).toLocaleString() : "..."}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] font-mono text-muted-foreground border-t border-border/50 pt-2">
                    <div className="flex items-center justify-between">
                      <span>Oldest:</span>
                      <span className="text-foreground">
                        {cov?.firstCandleUTC && !isNaN(new Date(cov.firstCandleUTC).getTime())
                          ? new Date(cov.firstCandleUTC).toLocaleDateString()
                          : "None"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Latest:</span>
                      <span className="text-foreground">
                        {cov?.lastCandleUTC && !isNaN(new Date(cov.lastCandleUTC).getTime())
                          ? new Date(cov.lastCandleUTC).toLocaleDateString()
                          : "None"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Detected Gaps:</span>
                      <span className={cov?.gapCount ? "text-amber-500 font-bold" : "text-green-500 font-bold"}>
                        {cov ? cov.gapCount : 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── MetaApi Live Synchronization Card ───────────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base sm:text-lg">MetaApi Historical Ingestion</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs font-mono text-amber-500 border-amber-500/30 bg-amber-500/10">
                Connected MT5 Feed
              </Badge>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              Fetch official UTC historical bars from your connected MetaApi account. Uses pagination semantics, respects the 1,000-candle request limit, and performs idempotent upserts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Timeframe</label>
                <div className="grid grid-cols-3 gap-1">
                  {["1m", "5m", "15m"].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setActiveTimeframe(tf)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors ${
                        activeTimeframe === tf
                          ? "bg-amber-500 text-black border-amber-500"
                          : "bg-background text-muted-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Candle Count Target</label>
                <div className="grid grid-cols-4 gap-1">
                  {[300, 500, 1000, 2000].map((cnt) => (
                    <button
                      key={cnt}
                      onClick={() => setSyncCount(cnt)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors ${
                        syncCount === cnt
                          ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
                          : "bg-background text-muted-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleSyncMetaApi}
                  disabled={isSyncing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Ingesting..." : `Sync ${activeTimeframe} Data`}
                </button>
              </div>
            </div>

            {syncStatusMsg && (
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-zinc-300">{syncStatusMsg}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Manual CSV Upload & Import Section ──────────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base sm:text-lg">Manual CSV File Import</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
                MT5 / TradingView CSV Compatible
              </Badge>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              Import historical market data from external CSV exports. Each record is validated: OHLC positive, High ≥ Open/Close/Low, Low ≤ Open/Close, and chronological ordering.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <label className="flex-1 w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-xl hover:border-amber-500/50 cursor-pointer bg-background transition-colors">
                <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                <span className="text-xs font-semibold text-foreground">Click to upload CSV or drag and drop</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  Expected columns: time/timestamp, open, high, low, close, volume, spread
                </span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="w-full sm:w-72 flex flex-col gap-2">
                <div className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Active Target:</span> XAUUSD ({activeTimeframe})
                </div>
                <button
                  onClick={handleImportCsv}
                  disabled={isImportingCsv || !csvText.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {isImportingCsv ? "Validating & Ingesting..." : "Validate & Save to DB"}
                </button>
              </div>
            </div>

            {csvImportResult && (
              <div
                className={`p-3 rounded-lg border text-xs font-mono flex items-start gap-2 ${
                  csvImportResult.success
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {csvImportResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">
                    {csvImportResult.success ? "Import Verified Successfully" : "Import Validation Error"}
                  </div>
                  <div className="mt-0.5 text-[11px]">
                    {csvImportResult.success
                      ? `Ingested ${csvImportResult.importedCount} valid candles. Skipped: ${csvImportResult.skippedCount || 0}.`
                      : csvImportResult.error}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Data Quality Rules & Audit Summary ──────────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <CardTitle className="text-base sm:text-lg">Storage Architecture & Invariant Rules</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5">
                <div className="font-semibold text-amber-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  OHLC Geometric Consistency
                </div>
                <p className="text-muted-foreground text-[11px]">
                  All high prices are verified ≥ max(open, close, low). All low prices are verified ≤ min(open, close, high). Any corrupted ticks or negative values are automatically rejected during parsing.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5">
                <div className="font-semibold text-amber-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Canonical UTC Timestamps
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Timestamps are normalized to UTC seconds and ISO strings. Weekend gaps (Friday 21:00 UTC to Sunday 22:00 UTC) are recognized as regular market closes and not marked as data corruption.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
