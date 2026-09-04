import { useState, useEffect } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

interface Settings {
  tradingMode: "DEMO" | "REAL";
  demoAccountId: string;
  realAccountId: string;
  autoTradingDemoEnabled: boolean;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;
  metaApiSymbol?: string;
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const [formData, setFormData] = useState<Settings>({
    tradingMode: "DEMO",
    demoAccountId: "",
    realAccountId: "",
    autoTradingDemoEnabled: false,
    autoTradingRealEnabled: false,
    autoTradingEnabled: false,
    metaApiSymbol: "XAUUSD"
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
  const handleToggle = (key: "autoTradingDemoEnabled" | "autoTradingRealEnabled", value: boolean) => {
    const updated = { ...formData, [key]: value };
    setFormData(updated);
    mutation.mutate(updated);
  };

  const handleModeChange = (mode: "DEMO" | "REAL") => {
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0 relative overflow-hidden">
          <SettingsIcon className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Trading Settings</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-4 text-center text-muted-foreground text-sm">Loading settings...</div>
        ) : (
          <div className="grid gap-6 py-4">
            <div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <Label className="font-bold cursor-pointer" htmlFor="auto-trading-demo">Auto Trading (Demo)</Label>
                <Switch
                  id="auto-trading-demo"
                  checked={formData.autoTradingDemoEnabled ?? false}
                  onCheckedChange={(c) => handleToggle("autoTradingDemoEnabled", c)}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex flex-col">
                  <Label className="font-bold text-red-500/50" htmlFor="auto-trading-real">Auto Trading (Real)</Label>
                  <span className="text-[10px] text-red-500 font-medium">Strictly disabled for safety</span>
                </div>
                <Switch
                  id="auto-trading-real"
                  checked={false}
                  disabled={true}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Switches save instantly to database and stay strictly OFF across page reloads.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Trading Mode</Label>
              <div className="flex bg-muted p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleModeChange("DEMO")}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
                    formData.tradingMode === "DEMO" ? "bg-background shadow-sm text-green-600 dark:text-green-400" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  DEMO ACCOUNT
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("REAL")}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${
                    formData.tradingMode === "REAL" ? "bg-background shadow-sm text-red-600 dark:text-red-400" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  REAL ACCOUNT
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="demo-id">MetaApi Demo Account ID</Label>
              <Input
                id="demo-id"
                value={formData.demoAccountId || ""}
                onChange={(e) => setFormData({ ...formData, demoAccountId: e.target.value })}
                placeholder="e.g. 5f7a...3d"
                className="font-mono text-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="real-id">MetaApi Real Account ID</Label>
              <Input
                id="real-id"
                value={formData.realAccountId || ""}
                onChange={(e) => setFormData({ ...formData, realAccountId: e.target.value })}
                placeholder="e.g. 9b2c...1f"
                className="font-mono text-sm border-red-500/20 focus-visible:ring-red-500/30"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="meta-symbol">MetaApi Symbol</Label>
              <Input
                id="meta-symbol"
                value={formData.metaApiSymbol || ""}
                onChange={(e) => setFormData({ ...formData, metaApiSymbol: e.target.value })}
                placeholder="e.g. XAUUSD or XAUUSD.a"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use default XAUUSD. Some brokers use suffixes like XAUUSD.a or XAUUSDm.
              </p>
            </div>
            <Button onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
