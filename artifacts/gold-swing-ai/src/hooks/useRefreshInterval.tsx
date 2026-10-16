import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { toast } from "sonner";

export interface RefreshIntervalOption {
  label: string;
  shortLabel: string;
  value: number; // in milliseconds, 0 means paused/manual
  description: string;
}

export const REFRESH_OPTIONS: RefreshIntervalOption[] = [
  { label: "5 seconds (Hyper-Fast)", shortLabel: "5s", value: 5000, description: "Fastest tick updates for active scalping" },
  { label: "10 seconds (Standard)", shortLabel: "10s", value: 10000, description: "Recommended balance of responsiveness & stability" },
  { label: "15 seconds (Balanced)", shortLabel: "15s", value: 15000, description: "Smooth swing monitoring" },
  { label: "30 seconds (Conservative)", shortLabel: "30s", value: 30000, description: "Lower frequency periodic updates" },
  { label: "60 seconds (Slow)", shortLabel: "60s", value: 60000, description: "Minimal network usage" },
  { label: "Manual Only (Paused)", shortLabel: "Paused", value: 0, description: "Disable automatic background refresh" },
];

export const DEFAULT_REFRESH_INTERVAL_MS = 10000;
const STORAGE_KEY = "goldSwingRefreshIntervalMs";

export function getStoredRefreshInterval(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch {}
  return DEFAULT_REFRESH_INTERVAL_MS;
}

interface RefreshIntervalContextType {
  refreshInterval: number;
  setRefreshInterval: (ms: number) => void;
  countdown: number;
  lastRefreshedAt: Date | null;
  isRefreshing: boolean;
  triggerManualRefresh: (showToast?: boolean) => Promise<void>;
  currentOption: RefreshIntervalOption;
}

const RefreshIntervalContext = createContext<RefreshIntervalContextType | null>(null);

export function RefreshIntervalProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [refreshInterval, setRefreshIntervalState] = useState<number>(() => getStoredRefreshInterval());
  const [countdown, setCountdown] = useState<number>(() => Math.max(1, Math.round(refreshInterval / 1000)));
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(() => new Date());
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Monitor active fetches matching signal or history endpoints
  const fetchingCount = useIsFetching({
    predicate: (query) => {
      const key = query.queryKey?.[0];
      return typeof key === "string" && (key.includes("/api/signal") || key.includes("/api/history"));
    },
  });

  const isRefreshing = isManualRefreshing || fetchingCount > 0;

  // Sync React Query defaults whenever refreshInterval changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, refreshInterval.toString());
    } catch {}

    const intervalValue = refreshInterval > 0 ? refreshInterval : false;

    // Set query defaults for signal queries
    queryClient.setQueryDefaults(["/api/signal"], {
      refetchInterval: intervalValue,
      refetchIntervalInBackground: true,
      staleTime: refreshInterval > 0 ? Math.min(3000, Math.floor(refreshInterval * 0.7)) : 0,
      refetchOnWindowFocus: true,
    });

    // Set query defaults for history queries
    queryClient.setQueryDefaults(["/api/history"], {
      refetchInterval: intervalValue ? Math.max(intervalValue, 10000) : false,
      refetchIntervalInBackground: true,
      staleTime: refreshInterval > 0 ? Math.min(3000, Math.floor(refreshInterval * 0.7)) : 0,
      refetchOnWindowFocus: true,
    });

    // Reset countdown
    setCountdown(refreshInterval > 0 ? Math.round(refreshInterval / 1000) : 0);
  }, [refreshInterval, queryClient]);

  // Countdown timer effect
  useEffect(() => {
    if (refreshInterval <= 0) {
      setCountdown(0);
      return;
    }

    const intervalSec = Math.round(refreshInterval / 1000);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setLastRefreshedAt(new Date());
          return intervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [refreshInterval]);

  const triggerManualRefresh = useCallback(async (showToast = true) => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/signal"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/history"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/connections"] }),
      ]);
      setLastRefreshedAt(new Date());
      setCountdown(refreshInterval > 0 ? Math.round(refreshInterval / 1000) : 0);
      if (showToast) {
        toast.success("Signals & market data refreshed", {
          description: `Auto-updating every ${refreshInterval > 0 ? `${refreshInterval / 1000}s` : "manual trigger"}.`,
          duration: 2500,
        });
      }
    } catch (err: any) {
      if (showToast) {
        toast.error("Failed to refresh signals", {
          description: err?.message || "Please check your network connection.",
        });
      }
    } finally {
      setTimeout(() => setIsManualRefreshing(false), 300);
    }
  }, [queryClient, refreshInterval]);

  const setRefreshInterval = useCallback((newInterval: number) => {
    setRefreshIntervalState(newInterval);
    const opt = REFRESH_OPTIONS.find((o) => o.value === newInterval);
    toast.info(`Refresh interval set to ${opt?.shortLabel || `${newInterval / 1000}s`}`, {
      description: opt?.description || "Trading signals will refresh on this cadence.",
      duration: 2500,
    });
  }, []);

  const currentOption = REFRESH_OPTIONS.find((o) => o.value === refreshInterval) || REFRESH_OPTIONS[1];

  return (
    <RefreshIntervalContext.Provider
      value={{
        refreshInterval,
        setRefreshInterval,
        countdown,
        lastRefreshedAt,
        isRefreshing,
        triggerManualRefresh,
        currentOption,
      }}
    >
      {children}
    </RefreshIntervalContext.Provider>
  );
}

export function useRefreshInterval() {
  const context = useContext(RefreshIntervalContext);
  if (!context) {
    throw new Error("useRefreshInterval must be used within a RefreshIntervalProvider");
  }
  return context;
}
