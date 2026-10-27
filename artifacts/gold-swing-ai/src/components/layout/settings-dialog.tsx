import { useState, useEffect } from "react";
import { 
  Settings as SettingsIcon, 
  KeyRound, 
  ShieldCheck, 
  ArrowLeft, 
  Sliders, 
  Check, 
  X,
  Lock,
  Sparkles,
  Zap,
  Target,
  Brain,
  Layers,
  TrendingUp
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/firebase/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Settings {
  tradingMode?: "REAL";
  realAccountId: string;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;
  metaApiSymbol?: string;
  riskPerTradePercent?: number;
  dailyProfitTargetPercent?: number;
  dailyStopLossPercent?: number;
  dashboardPasscode?: string;
  engineMode?: "ICT_SILVER_BULLET" | "ALPHA_TRADES_SD" | "HYBRID_DUAL" | "DETERMINISTIC_ORB" | "HERMES_ADAPTIVE";
  orbRiskPerTrade?: number;
  orbTargetMultiple?: number;
  orbStopAtrMultiplier?: number;
  orbAllowLondonSession?: boolean;
  orbNewsFilterEnabled?: boolean;
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { changePasscode } = useAuth();
  const queryClient = useQueryClient();

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
      setFormData(settings);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (newSettings: Partial<Settings>) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["settings"], data);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ 
        title: "Settings Saved",
        description: "Your trading configurations are permanently synchronized."
      });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  // Toggle switch and save immediately to DB
  const handleToggle = (key: "autoTradingRealEnabled", value: boolean) => {
    const updated = { ...formData, [key]: value, autoTradingEnabled: value };
    setFormData(updated);
    mutation.mutate(updated);
  };

  const handleModeChange = (mode: "REAL") => {
    const updated = { ...formData, tradingMode: mode };
    setFormData(updated);
    mutation.mutate(updated);
  };

  const handleSave = () => {
    if (formData) {
      mutation.mutate(formData);
      setOpen(false);
    }
  };

  const handleUpdatePasscode = async () => {
    if (!newPass || newPass.trim().length < 4) {
      toast({ title: "Passcode too short", description: "New passcode must be at least 4 characters.", variant: "destructive" });
      return;
    }
    setIsChangingPass(true);
    try {
      await changePasscode(currentPass || "goldswing2024", newPass.trim());
      toast({
        title: "Passcode Updated",
        description: "Your login passcode has been updated successfully."
      });
      setCurrentPass("");
      setNewPass("");
    } catch (err: any) {
      toast({
        title: "Failed to Update Passcode",
        description: err.message || "Please check your current passcode and try again.",
        variant: "destructive"
      });
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          id="header-settings-trigger"
          title="Trading Settings"
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 h-8 rounded-lg text-xs font-medium border border-border bg-black/5 dark:bg-white/5 text-muted-foreground hover:border-amber-500/30 hover:text-amber-600 dark:hover:text-amber-400 transition-all shrink-0 cursor-pointer"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-[490px] h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-2xl">
        {/* Sticky Header with Back Button */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-border bg-card/60 shrink-0 z-10 pr-12">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 h-8 text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 rounded-lg transition-colors cursor-pointer"
              id="settings-back-button-header"
              title="Go back to dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-amber-500" />
              <span>Back</span>
            </Button>
            <div className="h-4 w-px bg-border/80" />
            <DialogTitle className="text-sm sm:text-base font-bold tracking-tight">Trading Settings</DialogTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border",
              formData.tradingMode === "REAL"
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-green-500/10 text-green-500 border-green-500/20"
            )}>
              {formData.tradingMode}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground text-sm">
            Loading settings...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 overscroll-contain">
            {/* Signal-Only Mode Indicator */}
            <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                    Signal-Only Architecture Mode
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Order execution on MT5 is permanently disabled. Signals are generated for analysis only.
                  </p>
                </div>
              </div>
            </div>



            {/* Account IDs */}
            <div className="grid gap-3">


              <div className="grid gap-1.5">
                <Label htmlFor="real-id" className="text-xs font-semibold">MetaApi Real Account ID</Label>
                <Input
                  id="real-id"
                  value={formData.realAccountId || ""}
                  onChange={(e) => setFormData({ ...formData, realAccountId: e.target.value })}
                  placeholder="e.g. 9b2c...1f"
                  className="font-mono text-xs sm:text-sm h-9 border-red-500/30 focus-visible:ring-red-500/30"
                />
              </div>
            </div>

            {/* Engine Architecture & Strategy Mode */}
            <div className="p-3 sm:p-3.5 bg-muted/30 rounded-xl border border-border/70 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  <span>Engine Architecture & Strategy</span>
                </div>
                <span className="text-[10px] font-mono text-amber-500">
                  {formData.engineMode === "ICT_SILVER_BULLET" ? "ICT Silver Bullet" : formData.engineMode === "ALPHA_TRADES_SD" ? "Alpha Trades S&D" : formData.engineMode === "HYBRID_DUAL" ? "3h NY ORB + Hermes AI" : formData.engineMode === "DETERMINISTIC_ORB" ? "Pure 3h NY ORB" : "Hermes Adaptive"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, engineMode: "ICT_SILVER_BULLET" })}
                  className={cn(
                    "text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                    formData.engineMode === "ICT_SILVER_BULLET"
                      ? "bg-amber-500/10 border-amber-500/50 text-foreground"
                      : "bg-background/50 border-border text-muted-foreground hover:border-border/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      ICT Silver Bullet Strategy (Isolated)
                    </span>
                    {formData.engineMode === "ICT_SILVER_BULLET" && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Asian/London liquidity sweep detector + 15m FVG displacement (08:00 & 12:00-16:00 UTC, 1:3.4 R:R).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, engineMode: "ALPHA_TRADES_SD" })}
                  className={cn(
                    "text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                    formData.engineMode === "ALPHA_TRADES_SD"
                      ? "bg-emerald-500/10 border-emerald-500/50 text-foreground"
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
                  <p className="text-[10px] text-muted-foreground">
                    15m/1H Supply & Demand zones + counter-trendline break + rejection pinbar wick (1:2.5+ R:R intraday Gold).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, engineMode: "HYBRID_DUAL" })}
                  className={cn(
                    "text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                    formData.engineMode === "HYBRID_DUAL"
                      ? "bg-amber-500/10 border-amber-500/50 text-foreground"
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
                  <p className="text-[10px] text-muted-foreground">
                    Deterministic NY 3h ORB execution + Hermes AI Risk Guardian (2% sizing, 5R runner locked).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, engineMode: "DETERMINISTIC_ORB" })}
                  className={cn(
                    "text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                    formData.engineMode === "DETERMINISTIC_ORB"
                      ? "bg-amber-500/10 border-amber-500/50 text-foreground"
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
                  <p className="text-[10px] text-muted-foreground">
                    100% deterministic rules: 16:00 UTC breakout + EMA50 trend filter + strict 5R target.
                  </p>
                </button>
              </div>

              {/* Sizing & Targets */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                <div className="grid gap-1">
                  <Label htmlFor="diag-orb-risk" className="text-[10px] text-muted-foreground">ORB Risk (%)</Label>
                  <Input
                    id="diag-orb-risk"
                    type="number"
                    step="0.1"
                    value={formData.orbRiskPerTrade ?? 2.0}
                    onChange={(e) => setFormData({ ...formData, orbRiskPerTrade: parseFloat(e.target.value) || 0 })}
                    className="font-mono text-xs h-8 bg-background"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="diag-orb-rr" className="text-[10px] text-muted-foreground">Target Multiple (R)</Label>
                  <Input
                    id="diag-orb-rr"
                    type="number"
                    step="0.5"
                    value={formData.orbTargetMultiple ?? 5.0}
                    onChange={(e) => setFormData({ ...formData, orbTargetMultiple: parseFloat(e.target.value) || 0 })}
                    className="font-mono text-xs h-8 bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Risk & Limits */}
            <div className="p-3 sm:p-3.5 bg-muted/30 rounded-xl border border-border/70 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-500" />
                  <span>Risk & Limits</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Balance %</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="grid gap-1">
                  <Label htmlFor="risk-trade" className="text-[11px] text-muted-foreground">Risk / Trade (%)</Label>
                  <Input
                    id="risk-trade"
                    type="number"
                    step="0.1"
                    value={formData.riskPerTradePercent ?? 1.0}
                    onChange={(e) => setFormData({ ...formData, riskPerTradePercent: parseFloat(e.target.value) || 0 })}
                    className="font-mono text-xs h-9 bg-background"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="profit-target" className="text-[11px] text-green-500 font-medium">Daily Target (%)</Label>
                  <Input
                    id="profit-target"
                    type="number"
                    step="0.1"
                    value={formData.dailyProfitTargetPercent ?? 3.0}
                    onChange={(e) => setFormData({ ...formData, dailyProfitTargetPercent: parseFloat(e.target.value) || 0 })}
                    className="font-mono text-xs h-9 bg-background"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="stop-target" className="text-[11px] text-red-500 font-medium">Daily Stop (%)</Label>
                  <Input
                    id="stop-target"
                    type="number"
                    step="0.1"
                    value={formData.dailyStopLossPercent ?? 5.0}
                    onChange={(e) => setFormData({ ...formData, dailyStopLossPercent: parseFloat(e.target.value) || 0 })}
                    className="font-mono text-xs h-9 bg-background"
                  />
                </div>
              </div>
            </div>

            {/* MetaApi Symbol */}
            <div className="grid gap-1.5">
              <Label htmlFor="meta-symbol" className="text-xs font-semibold">MetaApi Symbol</Label>
              <Input
                id="meta-symbol"
                value={formData.metaApiSymbol || ""}
                onChange={(e) => setFormData({ ...formData, metaApiSymbol: e.target.value })}
                placeholder="e.g. XAUUSD or XAUUSD.a"
                className="font-mono text-xs sm:text-sm h-9"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Default is <code className="font-mono px-1 py-0.5 rounded bg-muted">XAUUSD</code>. Some brokers use suffixes like <code className="font-mono px-1 py-0.5 rounded bg-muted">XAUUSD.a</code> or <code className="font-mono px-1 py-0.5 rounded bg-muted">XAUUSDm</code>.
              </p>
            </div>

            {/* Dashboard Passcode Management */}
            <div className="border border-border/70 rounded-xl p-3 sm:p-3.5 bg-muted/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  <span>Dashboard Login Passcode</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Default: <code className="bg-muted px-1 py-0.5 rounded font-mono text-foreground">goldswing2024</code>
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Change the passcode used to unlock the dashboard.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Current Passcode</Label>
                  <Input
                    type="password"
                    placeholder="Current passcode"
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="h-8 text-xs font-mono bg-background"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">New Passcode</Label>
                  <Input
                    type="password"
                    placeholder="Min 4 chars"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="h-8 text-xs font-mono bg-background"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full text-xs h-8 font-medium"
                disabled={isChangingPass || !newPass}
                onClick={handleUpdatePasscode}
              >
                {isChangingPass ? "Updating Passcode..." : "Update Passcode"}
              </Button>
            </div>
          </div>
        )}

        {/* Sticky Footer with Back and Save Buttons */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border bg-card/60 shrink-0 z-10">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            className="h-10 px-4 text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0"
            id="settings-back-button-footer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={mutation.isPending}
            className="flex-1 h-10 text-xs font-bold bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-black shadow-sm transition-all"
            id="settings-save-button-footer"
          >
            {mutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
