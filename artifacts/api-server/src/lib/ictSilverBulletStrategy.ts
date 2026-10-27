import type { OHLCCandle } from "./goldPrice.js";
import {
  IctSilverBulletEngine,
  type IctSilverBulletConfig,
} from "./ictSilverBulletEngine.js";

export interface IctSilverBulletSignalResult {
  signal: "LONG" | "SHORT";
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  trend: "BULLISH" | "BEARISH";
  reason: string;
  tradeDuration: string;
  signalType: "ICT_SILVER_BULLET";
  engine: "ICT_SILVER_BULLET";
  sweptLevel: number;
  rejectionType: "BULLISH" | "BEARISH";
  fvgLevel?: number;
  riskRewardRatio: number;
  timeWindowActive: boolean;
}

/**
 * Resamples 15m (or 5m) candles into 1H OHLC candles to guarantee multi-timeframe
 * macro trend alignment even when separate 1H historical candles are not passed.
 */
export function resampleTo1HCandles(candles: OHLCCandle[]): OHLCCandle[] {
  if (!candles || candles.length === 0) return [];
  const map1h = new Map<number, OHLCCandle>();
  for (const c of candles) {
    const tSec = typeof c.time === "number"
      ? (c.time > 1e12 ? Math.floor(c.time / 1000) : c.time)
      : Math.floor(new Date(c.time).getTime() / 1000);
    const hourBucket = Math.floor(tSec / 3600) * 3600;
    const existing = map1h.get(hourBucket);
    if (!existing) {
      map1h.set(hourBucket, {
        time: hourBucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 1,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume = (existing.volume || 0) + (c.volume || 0);
    }
  }
  return Array.from(map1h.values()).sort((a, b) => (a.time as number) - (b.time as number));
}

/**
 * Evaluates ICT Silver Bullet Strategy using the rebuilt quantitative engine (IctSilverBulletEngine).
 * Fully deterministic, state-machine driven, DST-aware NY timezone conversion, pre-sweep liquidity,
 * objective displacement & Market Structure Shift (MSS), 3-candle FVG, and risk management.
 */
export function evaluateIctSilverBulletStrategy(
  currentPrice: number,
  spread: number,
  candles15m: OHLCCandle[],
  candles1h: OHLCCandle[],
  sessionInfo: { active: string; isAsian: boolean; isLondon: boolean; isNY: boolean; isOverlap: boolean },
  customConfig?: Partial<IctSilverBulletConfig>
): IctSilverBulletSignalResult | null {
  if (!candles15m || candles15m.length < 20) return null;

  const engine = new IctSilverBulletEngine(customConfig);
  const lastIndex = candles15m.length - 1;

  // Run engine across historical window to build state machine context
  const startIdx = Math.max(0, lastIndex - 60);
  let latestOutput = null;

  for (let idx = startIdx; idx <= lastIndex; idx++) {
    const res = engine.evaluateCandle(candles15m[idx].close, spread, candles15m, idx);
    if (res && res.isTradeReady) {
      latestOutput = res;
    }
  }

  if (!latestOutput || !latestOutput.isTradeReady || latestOutput.signal === "HOLD") {
    return null;
  }

  const setup = latestOutput.setup;
  const sweptLevel = setup.sweep ? setup.sweep.sweptLevel.price : latestOutput.entryPrice;

  return {
    signal: latestOutput.signal,
    confidence: latestOutput.confidence,
    entryPrice: latestOutput.entryPrice,
    stopLoss: latestOutput.stopLoss,
    takeProfit: latestOutput.takeProfit,
    trend: latestOutput.signal === "LONG" ? "BULLISH" : "BEARISH",
    reason: latestOutput.reason,
    tradeDuration: "1h - 3h (Institutional Expansion)",
    signalType: "ICT_SILVER_BULLET",
    engine: "ICT_SILVER_BULLET",
    sweptLevel,
    rejectionType: latestOutput.signal === "LONG" ? "BULLISH" : "BEARISH",
    fvgLevel: setup.fvg ? setup.fvg.midpoint : undefined,
    riskRewardRatio: latestOutput.riskRewardRatio,
    timeWindowActive: true,
  };
}
