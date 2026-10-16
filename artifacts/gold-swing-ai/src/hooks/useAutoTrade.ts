import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export interface SystemSettings {
  tradingMode?: "DEMO" | "REAL";
  autoTradingDemoEnabled?: boolean;
  autoTradingRealEnabled?: boolean;
  autoTradingEnabled?: boolean;
  demoAccountId?: string;
  realAccountId?: string;
  [key: string]: any;
}

export function useAutoTrade() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    refetchInterval: 6000,
  });

  const mode: "DEMO" | "REAL" = settings?.tradingMode === "REAL" ? "REAL" : "DEMO";
  
  const isDemoAuto = !!(settings?.autoTradingDemoEnabled ?? settings?.autoTradingEnabled ?? false);
  const isRealAuto = !!(settings?.autoTradingRealEnabled ?? false);
  const isAutoEnabled = mode === "REAL" ? isRealAuto : isDemoAuto;

  const updateMutation = useMutation({
    mutationFn: async (updated: Partial<SystemSettings>) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Failed to update setting");
      return res.json();
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ["settings"] });
      const previousSettings = queryClient.getQueryData<SystemSettings>(["settings"]);
      queryClient.setQueryData<SystemSettings>(["settings"], (old) => ({
        ...old,
        ...updated,
      }));
      return { previousSettings };
    },
    onError: (_err, _updated, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(["settings"], context.previousSettings);
      }
      toast({ title: "Failed to update Auto-Trade setting", variant: "destructive" });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const toggleAutoTrade = (explicitValue?: boolean) => {
    const nextValue = explicitValue !== undefined ? explicitValue : !isAutoEnabled;
    const payload: Partial<SystemSettings> = {};

    if (mode === "REAL") {
      payload.autoTradingRealEnabled = nextValue;
    } else {
      payload.autoTradingDemoEnabled = nextValue;
      payload.autoTradingEnabled = nextValue;
    }

    updateMutation.mutate(payload, {
      onSuccess: () => {
        toast({
          title: nextValue ? `⚡ Auto-Trade Activated (${mode})` : `⏸️ Auto-Trade Paused (${mode})`,
          description: nextValue
            ? `Signals will automatically execute on MetaApi (${mode} account).`
            : `Auto-execution suspended. Signals will be informational only.`,
        });
      },
    });
  };

  const toggleTradingMode = () => {
    const nextMode: "DEMO" | "REAL" = mode === "REAL" ? "DEMO" : "REAL";
    updateMutation.mutate(
      { tradingMode: nextMode },
      {
        onSuccess: () => {
          toast({
            title: `Trading Mode Switched to ${nextMode}`,
            description: `Now using ${nextMode} account settings.`,
          });
        },
      }
    );
  };

  const setSpecificAuto = (target: "DEMO" | "REAL", enabled: boolean) => {
    const payload: Partial<SystemSettings> = target === "REAL"
      ? { autoTradingRealEnabled: enabled }
      : { autoTradingDemoEnabled: enabled, autoTradingEnabled: enabled };
    
    updateMutation.mutate(payload, {
      onSuccess: () => {
        toast({
          title: `Auto-Trade ${target}: ${enabled ? "ON" : "OFF"}`,
          description: `${target} auto-trading is now ${enabled ? "active" : "disabled"}.`,
        });
      },
    });
  };

  return {
    settings,
    isLoading,
    mode,
    isAutoEnabled,
    isDemoAuto,
    isRealAuto,
    isPending: updateMutation.isPending,
    toggleAutoTrade,
    toggleTradingMode,
    setSpecificAuto,
  };
}
