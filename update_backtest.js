const fs = require('fs');

const fileContent = `import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, TrendingUp, TrendingDown, History, BarChart3, Clock, DollarSign, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function Backtest() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  const [timeframe, setTimeframe] = useState("5m");
  const [limit, setLimit] = useState("1000");
  const [initialBalance, setInitialBalance] = useState("10000");
  const [positionSizing, setPositionSizing] = useState("fixed");
  const [risk, setRisk] = useState("2");
  const [fixedLotSize, setFixedLotSize] = useState("0.10");

  const runBacktest = async () => {
    setRunning(true);
    setResults(null);
    try {
      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeframe,
          limit: parseInt(limit, 10),
          initialBalance: parseFloat(initialBalance),
          positionSizing,
          riskPerTrade: parseFloat(risk),
          fixedLotSize: parseFloat(fixedLotSize)
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to run backtest");
      }

      const data = await res.json();
      setResults(data);
      toast({
        title: "Backtest Complete",
        description: \\\`Simulated \\\${data.totalTrades} trades over \\\${limit} candles.\\\`,
      });
    } catch (err: any) {
      toast({
        title: "Backtest Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strategy Backtester</h1>
          <p className="text-muted-foreground mt-2">
            Simulate the signal engine against historical MetaApi tick data to evaluate performance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 shadow-sm">
            <CardHeader>
              <CardTitle>Parameters</CardTitle>
              <CardDescription>Configure the simulation environment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-2">
                <Label>Initial Balance ($)</Label>
                <Input 
                  type="number" 
                  step="any"
                  value={initialBalance} 
                  onChange={(e) => setInitialBalance(e.target.value)}
                  min="100"
                />
              </div>

              <div className="space-y-2">
                <Label>Timeframe</Label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1m">1 Minute</SelectItem>
                    <SelectItem value="5m">5 Minute</SelectItem>
                    <SelectItem value="15m">15 Minute</SelectItem>
                    <SelectItem value="1h">1 Hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Historical Candles Limit</Label>
                <Input 
                  type="number" 
                  value={limit} 
                  onChange={(e) => setLimit(e.target.value)}
                  min="200"
                  max="5000"
                />
                <p className="text-xs text-muted-foreground">Max depends on broker history limit.</p>
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <Label>Position Sizing</Label>
                <Select value={positionSizing} onValueChange={(val: any) => setPositionSizing(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="risk">% Risk per Trade</SelectItem>
                    <SelectItem value="fixed">Fixed Lot Size</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {positionSizing === "risk" ? (
                <div className="space-y-2">
                  <Label>Risk Per Trade (%)</Label>
                  <Input 
                    type="number" 
                    step="any"
                    value={risk} 
                    onChange={(e) => setRisk(e.target.value)}
                    min="0.1"
                  />
                  <p className="text-xs text-muted-foreground">Calculates lot size based on Stop Loss distance.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Fixed Lot Size</Label>
                  <Input 
                    type="number" 
                    step="any"
                    value={fixedLotSize} 
                    onChange={(e) => setFixedLotSize(e.target.value)}
                    min="0.01"
                  />
                </div>
              )}

              <Button 
                className="w-full font-medium" 
                size="lg"
                onClick={runBacktest}
                disabled={running}
              >
                {running ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></span>
                    Simulating...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4" /> Run Simulation
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-6">
            {!results && !running && (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 border rounded-xl border-dashed bg-muted/30">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <BarChart3 className="w-8 h-8 text-primary/50" />
                </div>
                <h3 className="text-lg font-medium">Ready to Test</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                  Run a backtest to see how the current signal strategy would have performed over the selected historical window.
                </p>
              </div>
            )}

            {running && (
              <div className="h-full flex flex-col items-center justify-center p-12 border rounded-xl bg-muted/10">
                <div className="animate-pulse flex flex-col items-center gap-4">
                  <div className="flex gap-2">
                    <div className="w-3 h-12 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-3 h-16 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-3 h-10 bg-primary/40 rounded-full animate-bounce"></div>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Running multi-indicator backtest algorithm...</p>
                </div>
              </div>
            )}

            {results && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="p-4 flex flex-col justify-center items-center text-center h-full">
                      <span className="text-sm text-muted-foreground mb-1">Est. Monthly</span>
                      <span className={\`text-2xl font-bold \${results.projectedMonthlyPnl >= 0 ? "text-green-500" : "text-red-500"}\`}>
                        {results.projectedMonthlyPnl >= 0 ? "+" : ""}\\\${\`\${results.projectedMonthlyPnl.toFixed(2)}\`}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">/ Month</span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex flex-col justify-center items-center text-center h-full">
                      <span className="text-sm text-muted-foreground mb-1">Final Balance</span>
                      <span className="text-2xl font-bold">\\\${\`\${results.finalBalance.toFixed(2)}\`}</span>
                      <span className="text-xs text-muted-foreground mt-1">From \\\${\`\${results.initialBalance.toFixed(2)}\`}</span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex flex-col justify-center items-center text-center h-full">
                      <span className="text-sm text-muted-foreground mb-1">Win Rate</span>
                      <span className="text-2xl font-bold">{results.winRate.toFixed(1)}%</span>
                      <span className="text-xs text-muted-foreground mt-1">{results.wins}W - {results.losses}L</span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex flex-col justify-center items-center text-center h-full">
                      <span className="text-sm text-muted-foreground mb-1">Total PnL</span>
                      <span className={\`text-2xl font-bold \${results.totalPnl >= 0 ? "text-green-500" : "text-red-500"}\`}>
                        {results.totalPnl >= 0 ? "+" : ""}\\\${\`\${results.totalPnl.toFixed(2)}\`}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">Net Profit</span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex flex-col justify-center items-center text-center h-full">
                      <span className="text-sm text-muted-foreground mb-1">Max DD</span>
                      <span className="text-2xl font-bold text-red-500">-{results.maxDrawdown.toFixed(2)}%</span>
                      <span className="text-xs text-muted-foreground mt-1">Peak-to-Trough</span>
                    </CardContent>
                  </Card>
                </div>

                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Trade History</CardTitle>
                    <CardDescription>Recent simulated trades</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {results.trades.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No trades executed matching criteria.</p>
                    ) : (
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {results.trades.map((trade: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className={\`p-2 rounded-full \${trade.type === 'LONG' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}\`}>
                                {trade.type === 'LONG' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              </div>
                              <div>
                                <div className="font-medium flex items-center gap-2">
                                  {trade.type} 
                                  <span className="text-xs font-normal text-muted-foreground">@ \\\${\`\${trade.entryPrice.toFixed(2)}\`}</span>
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(new Date(trade.entryTime), "MMM d, HH:mm")}</span>
                                  <span className="px-1.5 py-0.5 bg-muted rounded font-mono text-[10px] uppercase">Lot: {trade.lotSize?.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <div className={\`font-semibold \${trade.status === 'WIN' ? 'text-green-500' : trade.status === 'LOSS' ? 'text-red-500' : 'text-amber-500'}\`}>
                                {trade.status === 'WIN' ? \`+\\\$\${trade.pnl?.toFixed(2)}\` : trade.status === 'LOSS' ? \`-\\\$\${Math.abs(trade.pnl || 0).toFixed(2)}\` : 'OPEN'}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Exit: \\\${\`\${trade.exitPrice?.toFixed(2) || '-'}\`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
    </div>
  );
}
`;

fs.writeFileSync('./artifacts/gold-swing-ai/src/pages/backtest.tsx', fileContent);
