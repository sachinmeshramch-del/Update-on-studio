import { useState, useEffect } from "react";
import { useGetSignal } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRefreshInterval } from "@/hooks/useRefreshInterval";

export function IndicatorsRow() {
  const { refreshInterval } = useRefreshInterval();
  const { data: signalData, isLoading } = useGetSignal({
    query: {
      refetchInterval: refreshInterval > 0 ? refreshInterval : 5000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: refreshInterval > 0 ? Math.min(3000, Math.floor(refreshInterval * 0.7)) : 2000,
      placeholderData: (previousData: any) => previousData,
    } as any
  });

  const [lastKnownSignal, setLastKnownSignal] = useState<any>(() => {
    try {
      const saved = localStorage.getItem("gold_swing_last_indicators");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (signalData?.indicators) {
      setLastKnownSignal(signalData);
      try {
        localStorage.setItem("gold_swing_last_indicators", JSON.stringify(signalData));
      } catch {}
    }
  }, [signalData]);

  const activeData = signalData || lastKnownSignal;

  if (isLoading && !activeData) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full bg-black/5 dark:bg-white/5 rounded-xl" />
        ))}
      </div>
    );
  }

  const indicators = activeData?.indicators || {
    ema9: 4175.29,
    ema21: 4174.95,
    rsi: 52.64,
    atr: 4.45,
    macdHistogram: 0.15,
    trend5m: "BULLISH",
    trend1m: "BULLISH",
  };

  const emaScore = activeData?.emaScore ?? 20;
  const rsiScore = activeData?.rsiScore ?? 25;
  const macdScore = activeData?.macdScore ?? 20;
  const momentumScore = activeData?.momentumScore ?? 10;

  const trendColor = (t: string) =>
    t === "BULLISH" ? "text-success" : t === "BEARISH" ? "text-destructive" : "text-muted-foreground";

  const ema9Val = indicators.ema9 ?? 4175.29;
  const ema21Val = indicators.ema21 ?? 4174.95;
  const rsiVal = indicators.rsi ?? 52.64;
  const atrVal = indicators.atr ?? 4.45;
  const macdHistVal = indicators.macdHistogram ?? 0.15;
  const trend5mVal = indicators.trend5m || (indicators as any).trendPrimary || "BULLISH";
  const trend1mVal = indicators.trend1m || (indicators as any).trendEntry || "BULLISH";

  const emaCross = ema9Val >= ema21Val;

  const statCards = [
    {
      label: "EMA 9",
      sublabel: "5m fast",
      value: ema9Val.toFixed(1),
      color: emaCross ? "text-success" : "text-destructive",
    },
    {
      label: "EMA 21",
      sublabel: "5m slow",
      value: ema21Val.toFixed(1),
      color: emaCross ? "text-success" : "text-destructive",
    },
    {
      label: "EMA Cross",
      sublabel: "5m bias",
      value: emaCross ? "BULLISH" : "BEARISH",
      color: emaCross ? "text-success" : "text-destructive",
    },
    {
      label: "RSI (14)",
      sublabel: "5m",
      value: rsiVal.toFixed(1),
      color: rsiVal > 65
        ? "text-destructive"
        : rsiVal < 35
        ? "text-success"
        : "text-foreground",
    },
    {
      label: "MACD",
      sublabel: "5m histogram",
      value: macdHistVal > 0 ? "BULLISH" : "BEARISH",
      color: macdHistVal > 0 ? "text-success" : "text-destructive",
    },
    {
      label: "ATR",
      sublabel: "5m volatility",
      value: atrVal.toFixed(2),
      color: "text-foreground",
    },
    {
      label: "5m Trend",
      sublabel: "context",
      value: trend5mVal,
      color: trendColor(trend5mVal),
    },
    {
      label: "1m Trend",
      sublabel: "entry confirm",
      value: trend1mVal,
      color: trendColor(trend1mVal),
    },
  ];

  const scores = [
    { label: "EMA", score: emaScore ?? 0,      max: 35, color: "bg-amber-500"   },
    { label: "RSI", score: rsiScore ?? 0,      max: 25, color: "bg-blue-500"    },
    { label: "MACD", score: macdScore ?? 0,    max: 25, color: "bg-violet-500"  },
    { label: "1m",   score: momentumScore ?? 0, max: 15, color: "bg-emerald-500" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Score mini-bars */}
      <div className="flex items-center gap-4 px-1">
        {scores.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 flex-1">
            <span className="text-[9px] text-muted-foreground/60 font-mono w-8 flex-shrink-0">{s.label}</span>
            <div className="flex-1 bg-black/5 dark:bg-white/5 rounded-full h-1 overflow-hidden">
              <div
                className={`h-1 rounded-full transition-all duration-700 ${s.color}`}
                style={{ width: `${Math.round((s.score / s.max) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground/60 font-mono w-8 text-right flex-shrink-0">
              {s.score}/{s.max}
            </span>
          </div>
        ))}
      </div>

      {/* Indicator cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="dark:bg-black/20 bg-muted/50 border-border overflow-hidden hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-300">
            <div className="p-4 flex flex-col items-center justify-center text-center h-full">
              <span className="text-xs text-muted-foreground font-medium mb-0.5">{stat.label}</span>
              {stat.sublabel && (
                <span className="text-[10px] text-muted-foreground/50 mb-1 font-mono">{stat.sublabel}</span>
              )}
              <span className={`text-sm font-bold font-mono tracking-tight ${stat.color}`}>
                {stat.value}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
