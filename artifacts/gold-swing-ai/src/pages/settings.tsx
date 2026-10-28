import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Header } from "@/components/layout/header";
import { 
  Settings as SettingsIcon, 
  KeyRound, 
  ArrowLeft, 
  Sliders, 
  ShieldAlert,
  Check,
  Zap,
  Brain,
  Layers,
  Target,
  TrendingUp
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/firebase/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useConnections } from "@/hooks/useConnections";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface Settings {
  tradingMode: "REAL";
  demoAccountId?: string;
  realAccountId: string;
  autoTradingRealEnabled: boolean;
  autoTradingDemoEnabled?: boolean;
  autoTradingEnabled?: boolean;
  metaApiSymbol?: string;
  riskPerTradePercent?: number;
  dailyProfitTargetPercent?: number;
  dailyStopLossPercent?: number;
  dashboardPasscode?: string;
  engineMode?: "ICT_SILVER_BULLET" | "ALPHA_TRADES_SD" | "HYBRID_DUAL" | "DETERMINISTIC_ORB";
  orbRiskPerTrade?: number;
  orbTargetMultiple?: number;
  orbStopAtrMultiplier?: number;
  orbAllowLondonSession?: boolean;
  orbNewsFilterEnabled?: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { changePasscode } = useAuth();
  const connections = useConnections();

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [isChangingPass, setIsChangingPass] = useState(false);

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const [formData, setFormData] = useState<Settings>({
    tradingMode: "REAL",
    realAccountId: "",
    autoTradingRealEnabled: false,
    autoTradingEnabled: false,
    metaApiSymbol: "XAUUSD",
    riskPerTradePercent: 1.0,
    dailyProfitTargetPercent: 3.0,
    dailyStopLossPercent: 5.0,
    engineMode: "HYBRID_DUAL",
    orbRiskPerTrade: 2.0,
    orbTargetMultiple: 5.0,
    orbStopAtrMultiplier: 1.5,
    orbAllowLondonSession: false,
    orbNewsFilterEnabled: true,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        tradingMode: "REAL",
        demoAccountId: settings.demoAccountId || "",
        realAccountId: settings.realAccountId || "",
        autoTradingDemoEnabled: settings.autoTradingDemoEnabled ?? settings.autoTradingEnabled ?? false,
        autoTradingRealEnabled: settings.autoTradingRealEnabled ?? false,
        autoTradingEnabled: settings.autoTradingDemoEnabled ?? settings.autoTradingEnabled ?? false,
        metaApiSymbol: settings.metaApiSymbol || "XAUUSD",
        riskPerTradePercent: settings.riskPerTradePercent ?? 1.0,
        dailyProfitTargetPercent: settings.dailyProfitTargetPercent ?? 3.0,
        dailyStopLossPercent: settings.dailyStopLossPercent ?? 5.0,
        engineMode: settings.engineMode ?? (typeof window !== "undefined" ? (localStorage.getItem("gold_swing_engine_mode") as any) : null) ?? "HYBRID_DUAL",
        orbRiskPerTrade: settings.orbRiskPerTrade ?? 2.0,
        orbTargetMultiple: settings.orbTargetMultiple ?? 5.0,
        orbStopAtrMultiplier: settings.orbStopAtrMultiplier ?? 1.5,
        orbAllowLondonSession: settings.orbAllowLondonSession ?? false,
        orbNewsFilterEnabled: settings.orbNewsFilterEnabled ?? true,
      });
      if (settings.engineMode && typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", settings.engineMode);
      }
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (newSettings: Partial<Settings>) => {
      if (newSettings.engineMode && typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", newSettings.engineMode);
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.engineMode && typeof window !== "undefined") {
        localStorage.setItem("gold_swing_engine_mode", data.engineMode);
      }
      queryClient.setQueryData(["settings"], data);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/orb-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hermes/diagnostics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/signal"] });
      toast({
        title: "Settings Saved",
        description: "Trading configurations successfully updated.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (key: "autoTradingDemoEnabled" | "autoTradingRealEnabled", checked: boolean) => {
    const updated = { ...formData, [key]: checked, autoTradingEnabled: checked };
    setFormData(updated);
    mutation.mutate(updated);
  };

  const handleStrategySwitch = (mode: "ICT_SILVER_BULLET" | "ALPHA_TRADES_SD" | "HYBRID_DUAL" | "DETERMINISTIC_ORB") => {
    const updated = { ...formData, engineMode: mode };
    setFormData(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("gold_swing_engine_mode", mode);
      localStorage.setItem("gold_swing_backtest_strategy", mode);
    }
    queryClient.setQueryData(["settings"], (old: any) => ({ ...(old || {}), engineMode: mode }));
    queryClient.setQueryData(["/api/hermes/orb-state"], (old: any) => ({ ...(old || {}), engineMode: mode }));
    mutation.mutate(updated);
    fetch("/api/hermes/set-engine-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engineMode: mode }),
    }).catch(() => {});
  };

  const handleModeChange = (mode: "REAL") => {
    const updated = { ...formData, tradingMode: mode };
    setFormData(updated);
    mutation.mutate(updated);
  };

  const handleSave = () => {
    mutation.mutate(formData);
  };

  const handleUpdatePasscode = async () => {
    if (!newPass || newPass.length < 4) {
      toast({
        title: "Invalid Passcode",
        description: "Passcode must be at least 4 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPass(true);
    try {
      await changePasscode(currentPass || "goldswing2024", newPass.trim());
      toast({
        title: "Passcode Updated",
        description: "Dashboard passcode changed successfully.",
      });
      setCurrentPass("");
      setNewPass("");
    } catch {
      toast({
        title: "Failed to Update",
        description: "Current passcode was incorrect or an error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Header />

      <main className="flex-grow container mx-auto px-3 sm:px-4 py-4 md:py-8 max-w-2xl">
        {/* Navigation / Back Bar */}
        <motion.div 
          className="flex items-center justify-between gap-2 mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Link href="/">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-xs font-semibold hover:border-amber-500/40 transition-all cursor-pointer"
              id="settings-page-back-button"
            >
              <ArrowLeft className="w-4 h-4 text-amber-500" />
              <span>Back to Dashboard</span>
            </Button>
          </Link>

          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-mono font-bold uppercase px-2.5 py-1 rounded-full border",
              formData.tradingMode === "REAL"
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-green-500/10 text-green-500 border-green-500/20"
            )}>
              {formData.tradingMode} MODE
            </span>
          </div>
        </motion.div>

        {/* Main Settings Card */}
        <motion.div 
          className="border border-border/80 bg-card rounded-2xl shadow-lg overflow-hidden"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="px-5 sm:px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <SettingsIcon className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold">Trading Settings</h1>
                <p className="text-xs text-muted-foreground">Manage execution modes, broker accounts, and risk parameters</p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              Loading settings...
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-6">
              {/* Signal-Only Mode Indicator */}
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                      Signal-Only Architecture Mode
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                        PROTECTED
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Application operates strictly in Signal-Only mode. Real broker order placement is permanently disabled.
                    </p>
                  </div>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Active Trading Mode</Label>
                <div className="grid grid-cols-2 gap-2 bg-muted p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleModeChange("DEMO")}
                    className={`text-xs font-semibold py-2.5 rounded-lg transition-all ${
                      formData.tradingMode === "DEMO"
                        ? "bg-background shadow-sm text-green-600 dark:text-green-400"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    DEMO ACCOUNT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange("REAL")}
                    className={`text-xs font-semibold py-2.5 rounded-lg transition-all ${
                      formData.tradingMode === "REAL"
                        ? "bg-background shadow-sm text-red-600 dark:text-red-400"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    REAL ACCOUNT
                  </button>
                </div>
              </div>

              {/* Account IDs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="page-demo-id" className="text-xs font-semibold">MetaApi Demo Account ID</Label>
                  <Input
                    id="page-demo-id"
                    value={formData.demoAccountId || ""}
                    onChange={(e) => setFormData({ ...formData, demoAccountId: e.target.value })}
                    placeholder="e.g. 5f7a...3d"
                    className="font-mono text-xs sm:text-sm h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="page-real-id" className="text-xs font-semibold">MetaApi Real Account ID</Label>
                  <Input
                    id="page-real-id"
                    value={formData.realAccountId || ""}
                    onChange={(e) => setFormData({ ...formData, realAccountId: e.target.value })}
                    placeholder="e.g. 9b2c...1f"
                    className="font-mono text-xs sm:text-sm h-10 border-red-500/30 focus-visible:ring-red-500/30"
                  />
                  {connections?.funds && (
                    <div className="mt-2 p-3 rounded-lg border border-border bg-muted/20 space-y-1 text-xs font-mono">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Connected MT5 Equity:</span>
                        <span className="font-bold text-foreground">${connections.funds.equity.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Free Margin:</span>
                        <span className={cn("font-bold", connections.funds.canTrade ? "text-emerald-500" : "text-amber-500")}>
                          ${connections.funds.freeMargin.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Min Lot (0.01) Margin Req:</span>
                        <span className="font-bold text-foreground">~${connections.funds.marginForMinLot.toFixed(2)}</span>
                      </div>
                      {!connections.funds.canTrade && (
                        <p className="text-[11px] text-amber-500 font-sans pt-1 border-t border-border/50">
                          ⚠️ Current Free Margin is below the minimum margin required to open 0.01 lot of Gold on your broker. Deposit at least $10-$20 to allow automated execution.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Engine Architecture & Strategy Mode */}
              <div className="p-4 bg-muted/30 rounded-xl border border-border/70 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    <span>Engine Architecture & Strategy</span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-500">
                    {formData.engineMode === "ICT_SILVER_BULLET" ? "ICT Silver Bullet" : formData.engineMode === "ALPHA_TRADES_SD" ? "Alpha Trades S&D" : formData.engineMode === "DETERMINISTIC_ORB" ? "Pure 3h NY ORB" : "Hybrid Dual-Engine"}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStrategySwitch("ICT_SILVER_BULLET")}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                      formData.engineMode === "ICT_SILVER_BULLET"
                        ? "bg-amber-500/10 border-amber-500/50 text-foreground shadow-sm"
                        : "bg-background/50 border-border text-muted-foreground hover:border-border/80"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        ICT Silver Bullet & Liquidity Sweep Strategy
                      </span>
                      {formData.engineMode === "ICT_SILVER_BULLET" && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Asian/London liquidity sweep detector + 3-candle Fair Value Gap (FVG) displacement + 1:3.0 Risk-to-Reward ratio.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStrategySwitch("ALPHA_TRADES_SD")}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                      formData.engineMode === "ALPHA_TRADES_SD"
                        ? "bg-emerald-500/10 border-emerald-500/50 text-foreground shadow-sm"
                        : "bg-background/50 border-border text-muted-foreground hover:border-border/80"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Alpha Trades Supply & Demand (@alphatradesss)
                      </span>
                      {formData.engineMode === "ALPHA_TRADES_SD" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      15m/1H Supply & Demand zones + counter-trendline break + rejection pinbar wick (1:2.5+ R:R intraday Gold).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStrategySwitch("HYBRID_DUAL")}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                      formData.engineMode === "HYBRID_DUAL"
                        ? "bg-amber-500/10 border-amber-500/50 text-foreground shadow-sm"
                        : "bg-background/50 border-border text-muted-foreground hover:border-border/80"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        Hybrid Dual-Engine (Recommended)
                      </span>
                      {formData.engineMode === "HYBRID_DUAL" && <Check className="w-3.5 h-3.5 text-amber-500" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Deterministic 3-Hour NY Opening Range Breakout (16:00 UTC) with EMA50 trend filter, verified through Hermes AI Risk Guardian (spread check, 2% lot sizing & strict 5R runner discipline).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStrategySwitch("DETERMINISTIC_ORB")}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                      formData.engineMode === "DETERMINISTIC_ORB"
                        ? "bg-amber-500/10 border-amber-500/50 text-foreground shadow-sm"
                        : "bg-background/50 border-border text-muted-foreground hover:border-border/80"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-sky-500" />
                        Deterministic NY 3h ORB Engine
                      </span>
                      {formData.engineMode === "DETERMINISTIC_ORB" && <Check className="w-3.5 h-3.5 text-amber-500" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      100% deterministic mathematical execution. Fires at 16:00 UTC if price breaks out of the 13:00-15:00 UTC 3-hour window and aligns with EMA50. Strict 5R profit target.
                    </p>
                  </button>
                </div>

                {/* Quantitative ORB Parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <Label htmlFor="page-orb-risk" className="text-xs text-muted-foreground">ORB Risk / Trade (%)</Label>
                    <Input
                      id="page-orb-risk"
                      type="number"
                      step="0.1"
                      value={formData.orbRiskPerTrade ?? 2.0}
                      onChange={(e) => setFormData({ ...formData, orbRiskPerTrade: parseFloat(e.target.value) || 0 })}
                      className="font-mono text-xs sm:text-sm h-10 bg-background"
                    />
                    <span className="text-[10px] text-muted-foreground">Article tested: 2.0%</span>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="page-orb-target" className="text-xs text-muted-foreground">Target Multiple (R)</Label>
                    <Input
                      id="page-orb-target"
                      type="number"
                      step="0.5"
                      value={formData.orbTargetMultiple ?? 5.0}
                      onChange={(e) => setFormData({ ...formData, orbTargetMultiple: parseFloat(e.target.value) || 0 })}
                      className="font-mono text-xs sm:text-sm h-10 bg-background"
                    />
                    <span className="text-[10px] text-muted-foreground">Strict 5R asymmetric</span>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="page-orb-stop" className="text-xs text-muted-foreground">Stop Loss (x ATR)</Label>
                    <Input
                      id="page-orb-stop"
                      type="number"
                      step="0.1"
                      value={formData.orbStopAtrMultiplier ?? 1.5}
                      onChange={(e) => setFormData({ ...formData, orbStopAtrMultiplier: parseFloat(e.target.value) || 0 })}
                      className="font-mono text-xs sm:text-sm h-10 bg-background"
                    />
                    <span className="text-[10px] text-muted-foreground">1.5x ATR14</span>
                  </div>
                </div>

                {/* London Session ORB Extension */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="space-y-0.5">
                    <Label htmlFor="page-london-orb" className="text-xs font-semibold cursor-pointer">London Session ORB (07:00-09:00 UTC)</Label>
                    <p className="text-[11px] text-muted-foreground">Run identical 3-hour breakout logic during London open to double trade frequency.</p>
                  </div>
                  <Switch
                    id="page-london-orb"
                    checked={formData.orbAllowLondonSession ?? false}
                    onCheckedChange={(checked) => setFormData({ ...formData, orbAllowLondonSession: checked })}
                  />
                </div>
              </div>

              {/* Risk & Limits */}
              <div className="p-4 bg-muted/30 rounded-xl border border-border/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Sliders className="w-3.5 h-3.5 text-amber-500" />
                    <span>Risk & Daily Limits</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">% of account equity</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="page-risk" className="text-xs text-muted-foreground">Risk / Trade (%)</Label>
                    <Input
                      id="page-risk"
                      type="number"
                      step="0.1"
                      value={formData.riskPerTradePercent ?? 1.0}
                      onChange={(e) => setFormData({ ...formData, riskPerTradePercent: parseFloat(e.target.value) || 0 })}
                      className="font-mono text-xs sm:text-sm h-10 bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="page-profit" className="text-xs text-green-500 font-medium">Daily Target (%)</Label>
                    <Input
                      id="page-profit"
                      type="number"
                      step="0.1"
                      value={formData.dailyProfitTargetPercent ?? 3.0}
                      onChange={(e) => setFormData({ ...formData, dailyProfitTargetPercent: parseFloat(e.target.value) || 0 })}
                      className="font-mono text-xs sm:text-sm h-10 bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="page-stop" className="text-xs text-red-500 font-medium">Daily Stop (%)</Label>
                    <Input
                      id="page-stop"
                      type="number"
                      step="0.1"
                      value={formData.dailyStopLossPercent ?? 5.0}
                      onChange={(e) => setFormData({ ...formData, dailyStopLossPercent: parseFloat(e.target.value) || 0 })}
                      className="font-mono text-xs sm:text-sm h-10 bg-background"
                    />
                  </div>
                </div>
              </div>

              {/* Symbol */}
              <div className="space-y-1.5">
                <Label htmlFor="page-symbol" className="text-xs font-semibold">MetaApi Symbol</Label>
                <Input
                  id="page-symbol"
                  value={formData.metaApiSymbol || ""}
                  onChange={(e) => setFormData({ ...formData, metaApiSymbol: e.target.value })}
                  placeholder="e.g. XAUUSD or XAUUSD.a"
                  className="font-mono text-xs sm:text-sm h-10"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Default is <code className="font-mono px-1 py-0.5 rounded bg-muted">XAUUSD</code>. Modify if your broker uses special suffixes like <code className="font-mono px-1 py-0.5 rounded bg-muted">XAUUSD.a</code> or <code className="font-mono px-1 py-0.5 rounded bg-muted">XAUUSDm</code>.
                </p>
              </div>

              {/* Dashboard Passcode */}
              <div className="border border-border/70 rounded-xl p-4 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    <span>Dashboard Passcode</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Default: <code className="bg-muted px-1 py-0.5 rounded font-mono text-foreground">goldswing2024</code></span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Current Passcode</Label>
                    <Input
                      type="password"
                      placeholder="Current passcode"
                      value={currentPass}
                      onChange={(e) => setCurrentPass(e.target.value)}
                      className="h-9 text-xs font-mono bg-background"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">New Passcode</Label>
                    <Input
                      type="password"
                      placeholder="Min 4 characters"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="h-9 text-xs font-mono bg-background"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full text-xs h-9 font-medium"
                  disabled={isChangingPass || !newPass}
                  onClick={handleUpdatePasscode}
                >
                  {isChangingPass ? "Updating Passcode..." : "Update Passcode"}
                </Button>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <Link href="/">
                  <Button variant="outline" className="h-10 px-5 text-xs font-semibold flex items-center gap-1.5">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Dashboard</span>
                  </Button>
                </Link>
                <Button
                  onClick={handleSave}
                  disabled={mutation.isPending}
                  className="flex-1 h-10 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black shadow-sm"
                  id="page-save-settings-btn"
                >
                  {mutation.isPending ? "Saving Settings..." : "Save Settings"}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
