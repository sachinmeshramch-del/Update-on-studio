import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  Trash2,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

export function CsvImportDialog({ open, onOpenChange, onImportSuccess }: CsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setFile(null);
    setCsvText("");
    setPreviewRows([]);
    setTotalRows(0);
    setIsSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSelect(selectedFile: File) {
    if (!selectedFile.name.endsWith(".csv") && !selectedFile.type.includes("csv") && !selectedFile.type.includes("text")) {
      toast.error("Please upload a valid .csv file");
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      setCsvText(text);
      parsePreview(text);
    };
    reader.readAsText(selectedFile);
  }

  function parsePreview(text: string) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("#"));
    if (lines.length < 2) {
      toast.error("CSV contains no trade data rows");
      return;
    }

    const delimiter = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));

    const findCol = (...aliases: string[]) => {
      for (const a of aliases) {
        const idx = headers.findIndex(h => h.includes(a));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const colSignal = findCol("signal", "type", "direction", "side");
    const colEntry = findCol("entryprice", "entry", "openprice", "price", "open");
    const colSl = findCol("stoploss", "sl", "stop");
    const colTp = findCol("takeprofit", "tp", "target");
    const colPnl = findCol("pnlpoints", "points", "pts", "pnl", "profit");
    const colTime = findCol("time", "date", "createdat", "timestamp");

    const parsed: any[] = [];
    let validCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ""));
      if (parts.length < 2) continue;

      const rawDir = colSignal !== -1 ? (parts[colSignal] || "").toUpperCase() : "";
      let signal = "LONG";
      if (rawDir.includes("SELL") || rawDir.includes("SHORT")) signal = "SHORT";

      const entry = colEntry !== -1 ? parseFloat(parts[colEntry]) : NaN;
      if (isNaN(entry)) continue;

      const sl = colSl !== -1 ? parseFloat(parts[colSl]) : signal === "LONG" ? entry - 6.5 : entry + 6.5;
      const tp = colTp !== -1 ? parseFloat(parts[colTp]) : signal === "LONG" ? entry + 16.25 : entry - 16.25;
      const pnl = colPnl !== -1 ? parseFloat(parts[colPnl]) : 0;
      const time = colTime !== -1 ? parts[colTime] : new Date().toLocaleDateString();

      validCount++;
      if (parsed.length < 5) {
        parsed.push({
          row: i,
          signal,
          entry,
          sl,
          tp,
          pnl,
          time,
        });
      }
    }

    setPreviewRows(parsed);
    setTotalRows(validCount);
  }

  async function handleUpload() {
    if (!csvText) {
      toast.error("Please select a CSV file first");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/history/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to import trades");
      }

      toast.success(`Successfully imported ${data.importedCount} historical trades into the bot database!`);
      if (onImportSuccess) onImportSuccess();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast.error(err.message || "Import failed. Please verify CSV format.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) resetState(); }}>
      <DialogContent className="max-w-2xl bg-card border-border shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-5 border-b border-border bg-black/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Import Older Trades (CSV)
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Import past MT4/MT5 trade history or journal records to feed the bot&apos;s performance analyzer
                </DialogDescription>
              </div>
            </div>

            <a
              href="/api/history/csv-template"
              download="trade_history_template.csv"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-black/10 dark:bg-white/5 border border-border hover:bg-black/20 dark:hover:bg-white/10 text-foreground transition-all shrink-0"
              title="Download standard CSV format template"
            >
              <Download className="w-3.5 h-3.5 text-amber-500" />
              <span>Sample Template</span>
            </a>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const droppedFile = e.dataTransfer.files?.[0];
              if (droppedFile) handleFileSelect(droppedFile);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
              isDragging
                ? "border-amber-500 bg-amber-500/10"
                : file
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-border hover:border-amber-500/50 hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />

            {file ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB · {totalRows} trades ready to import
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mb-1 animate-bounce" />
                <p className="text-sm font-semibold text-foreground">
                  Click to select or drag and drop your CSV file here
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Supports MT4, MT5 trade reports, TradingView exports, or custom journal spreadsheets
                </p>
              </>
            )}
          </div>

          {/* Guidelines Banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-black/20 border border-border text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p>
              <strong>Auto-mapped columns:</strong> Time/Date, Direction (Buy/Sell or Long/Short), Entry Price, Stop Loss, Take Profit, Exit Price, and PnL. Missing stops are automatically populated using a standard 1:2.5 risk ratio.
            </p>
          </div>

          {/* Preview Table */}
          {previewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-foreground">Parsed Trades Preview (First 5 of {totalRows})</span>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
                  {totalRows} Valid Trades Found
                </Badge>
              </div>

              <div className="border border-border rounded-lg overflow-hidden bg-black/30">
                <table className="w-full text-xs text-left">
                  <thead className="bg-black/50 text-[10px] text-muted-foreground uppercase border-b border-border">
                    <tr>
                      <th className="p-2">Time</th>
                      <th className="p-2">Signal</th>
                      <th className="p-2">Entry</th>
                      <th className="p-2">SL</th>
                      <th className="p-2">TP</th>
                      <th className="p-2 text-right">PnL (pts)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {previewRows.map((r, idx) => (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="p-2 text-muted-foreground text-[11px] font-sans">{r.time}</td>
                        <td className="p-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.signal === "LONG" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                          }`}>
                            {r.signal}
                          </span>
                        </td>
                        <td className="p-2 text-foreground font-semibold">{formatPrice(r.entry)}</td>
                        <td className="p-2 text-destructive">{formatPrice(r.sl)}</td>
                        <td className="p-2 text-emerald-400">{formatPrice(r.tp)}</td>
                        <td className={`p-2 text-right font-bold ${r.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {r.pnl >= 0 ? "+" : ""}{r.pnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-black/20 flex items-center justify-between gap-3">
          {file ? (
            <button
              onClick={resetState}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear File</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-black/10 dark:bg-white/5 hover:bg-black/20 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || totalRows === 0 || isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black disabled:opacity-50 transition-all shadow-md active:scale-95"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Importing Trades…" : `Import ${totalRows} Trades`}</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
