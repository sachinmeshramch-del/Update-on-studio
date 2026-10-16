import type { OHLCCandle } from "./goldPrice.js";
import { getMetaApiHistoricalOHLC } from "./metaApiFeed.js";
import {
  calcEMA,
  calcRSI,
  calcMACD,
  calcATR,
  calcADX,
  detectCandlePattern,
  detectOrderBlocks,
  detectSweepRejection,
  analyzeMarketRange,
  isNearSR,
} from "./technicalIndicators.js";
import { calculateDynamicAtrStopLoss } from "./dynamicAtrStopLoss.js";
import { logger } from "./logger.js";

export interface BacktestParams {
  timeframe?: string; // "5m" | "15m" | "1h" | "1d"
  candleCount?: number; // 200 - 3000
  initialBalance?: number; // default: 10000
  riskPercent?: number; // default: 1.0 (%)
  spread?: number; // default: 0.45 pts
  contractSize?: number; // default: 100 (oz per lot)
  // Strategy Feature Flags to test
  featureStructuralStop?: boolean; // default: true
  featureEntryConfirmation?: boolean; // default: true
  featureContextPatternFilter?: boolean; // default: true
  featureSpreadGuard?: boolean; // default: true
  featureSessionFilter?: boolean; // default: true
  tpRatio?: number; // default: 2.5
}

export interface BacktestTrade {
  id: string;
  entryTime: string;
  exitTime: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnlPoints: number;
  pnlDollars: number;
  outcome: "WIN" | "LOSS";
  rOutcome: number;
  maePoints: number;
  mfePoints: number;
  maeR: number;
  mfeR: number;
  durationMinutes: number;
  pattern: string;
  session: "London" | "New York" | "Asian" | "London/NY Overlap" | "Off-hours";
  regime: "TRENDING" | "RANGING";
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "END_OF_DATA";
  balanceAfter: number;
}

export interface CategoryBreakdown {
  name: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnlPoints: number;
  netPnlDollars: number;
  profitFactor: number;
  expectancyR: number;
}

export interface EquityCurvePoint {
  time: string;
  tradeIndex: number;
  balance: number;
  equity: number;
  drawdownDollars: number;
  drawdownPercent: number;
}

export interface BacktestResult {
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    initialBalance: number;
    finalBalance: number;
    netProfitDollars: number;
    netProfitPercent: number;
    netProfitPoints: number;
    profitFactor: number;
    expectancyR: number;
    maxDrawdownDollars: number;
    maxDrawdownPercent: number;
    averageWinDollars: number;
    averageLossDollars: number;
    averageWinPoints: number;
    averageLossPoints: number;
    winLossRatio: number;
    sharpeRatio: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    avgTradeDurationMinutes: number;
    candlesEvaluated: number;
    timeframe: string;
    dataSource: string;
  };
  breakdownBySession: CategoryBreakdown[];
  breakdownByPattern: CategoryBreakdown[];
  breakdownByRegime: CategoryBreakdown[];
  breakdownByDirection: CategoryBreakdown[];
  equityCurve: EquityCurvePoint[];
  trades: BacktestTrade[];
  testedParams: BacktestParams;
}

function getSessionName(utcHour: number): "London" | "New York" | "Asian" | "London/NY Overlap" | "Off-hours" {
  const isLondon = utcHour >= 7 && utcHour < 17;
  const isNY = utcHour >= 12 && utcHour < 21;
  const isAsian = utcHour >= 22 || utcHour < 7;

  if (isLondon && isNY) return "London/NY Overlap";
  if (isLondon) return "London";
  if (isNY) return "New York";
  if (isAsian) return "Asian";
  return "Off-hours";
}

/**
 * Executes historical backtest simulation using real MetaApi (or fallback synthetic) candles
 */
export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const tf = params.timeframe || "5m";
  const count = Math.min(Math.max(params.candleCount || 1000, 100), 3000);
  const initialBalance = params.initialBalance || 10000;
  const riskPercent = params.riskPercent || 1.0;
  const spread = typeof params.spread === "number" ? Math.max(0.1, params.spread) : 0.45;
  const contractSize = params.contractSize || 100;
  const tpRatio = params.tpRatio || 2.5;

  const featureStructuralStop = params.featureStructuralStop !== false;
  const featureEntryConfirmation = params.featureEntryConfirmation !== false;
  const featureContextPatternFilter = params.featureContextPatternFilter !== false;
  const featureSpreadGuard = params.featureSpreadGuard !== false;
  const featureSessionFilter = params.featureSessionFilter !== false;

  logger.info({ tf, count, featureStructuralStop, featureSessionFilter }, "[Backtest] Starting historical simulation");

  // Fetch candles
  let candles: OHLCCandle[] = [];
  try {
    candles = await getMetaApiHistoricalOHLC(tf, count);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[Backtest] MetaApi fetch failed, using fallback candles");
  }

  if (!candles || candles.length < 50) {
    throw new Error(`Insufficient historical candle data for timeframe ${tf} (found ${candles?.length || 0} candles)`);
  }

  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdownDollars = 0;
  let maxDrawdownPercent = 0;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityCurvePoint[] = [
    {
      time: new Date(candles[0].time).toISOString(),
      tradeIndex: 0,
      balance: initialBalance,
      equity: initialBalance,
      drawdownDollars: 0,
      drawdownPercent: 0,
    },
  ];

  // Minimum warmup period for indicators
  const warmup = 35;
  let i = warmup;

  while (i < candles.length - 2) {
    const currentSlice = candles.slice(0, i + 1);
    const curr = candles[i];
    const currDate = new Date(curr.time);
    const utcH = currDate.getUTCHours();
    const utcM = currDate.getUTCMinutes();
    const totalMinutes = utcH * 60 + utcM;

    // 1. Session Guard check
    if (featureSessionFilter) {
      const isLondonNY = utcH >= 7 && utcH < 17;
      const isRollover = totalMinutes >= 21 * 60 + 45 && totalMinutes <= 22 * 60 + 30;
      const isAsian = utcH >= 22 || utcH < 7;
      if (!isLondonNY || isRollover || isAsian) {
        i++;
        continue;
      }
    }

    // 2. Technical indicator calculations
    const closes = currentSlice.map(c => c.close);
    const atr = calcATR(currentSlice, 14);
    if (!atr || atr <= 0.2) {
      i++;
      continue;
    }

    const ema9Series = calcEMA(closes, 9);
    const ema21Series = calcEMA(closes, 21);
    const ema50Series = calcEMA(closes, 50);

    const lastEma9 = ema9Series[ema9Series.length - 1];
    const lastEma21 = ema21Series[ema21Series.length - 1];
    const lastEma50 = ema50Series[ema50Series.length - 1];

    const rsiSeries = calcRSI(closes, 14);
    const lastRsi = rsiSeries[rsiSeries.length - 1];

    const candleResult = detectCandlePattern(currentSlice, atr);
    const orderBlocks = detectOrderBlocks(currentSlice);
    const rangeInfo = analyzeMarketRange(currentSlice);

    const isTrendBullish = lastEma9 > lastEma21 && curr.close > lastEma50;
    const isTrendBearish = lastEma9 < lastEma21 && curr.close < lastEma50;

    let signalDir: "LONG" | "SHORT" | null = null;
    let patternName = candleResult.pattern || "Trend Flow";

    // Detect signal intent
    if (candleResult.pattern !== null && candleResult.bias !== null) {
      // Context Pattern Filter Check
      if (featureContextPatternFilter) {
        const isDoji = candleResult.pattern === "Dragonfly Doji" || candleResult.pattern === "Gravestone Doji";
        if (isDoji) {
          const inOB = (orderBlocks.bullishOB?.inZone || orderBlocks.bearishOB?.inZone) ?? false;
          const atSR = candleResult.confluenceMet || isNearSR(curr.close, currentSlice, atr);
          if (!inOB && !atSR) {
            // Drop unanchored Doji
            i++;
            continue;
          }
        }

        if (candleResult.pattern === "Bullish Engulfing" || candleResult.pattern === "Hammer") {
          if (!isTrendBullish && lastEma9 < lastEma21) {
            i++;
            continue; // Dropped: counter-trend
          }
        } else if (candleResult.pattern === "Bearish Engulfing" || candleResult.pattern === "Shooting Star") {
          if (!isTrendBearish && lastEma9 > lastEma21) {
            i++;
            continue; // Dropped: counter-trend
          }
        }
      }

      signalDir = candleResult.bias === "BULLISH" ? "LONG" : "SHORT";
    } else if (isTrendBullish && lastRsi >= 42 && lastRsi <= 62) {
      signalDir = "LONG";
      patternName = "EMA Trend Follow";
    } else if (isTrendBearish && lastRsi >= 38 && lastRsi <= 58) {
      signalDir = "SHORT";
      patternName = "EMA Trend Follow";
    }

    if (!signalDir) {
      i++;
      continue;
    }

    // 3. Entry Confirmation Check (Feature Entry Confirmation)
    let entryBarIndex = i;
    if (featureEntryConfirmation) {
      const nextBar1 = candles[i + 1];
      if (!nextBar1) break;

      let confirmed = false;
      if (signalDir === "LONG" && nextBar1.close > curr.high) {
        confirmed = true;
        entryBarIndex = i + 1;
      } else if (signalDir === "SHORT" && nextBar1.close < curr.low) {
        confirmed = true;
        entryBarIndex = i + 1;
      } else {
        // Check second confirmation candle
        const nextBar2 = candles[i + 2];
        if (nextBar2) {
          if (signalDir === "LONG" && nextBar2.close > curr.high) {
            confirmed = true;
            entryBarIndex = i + 2;
          } else if (signalDir === "SHORT" && nextBar2.close < curr.low) {
            confirmed = true;
            entryBarIndex = i + 2;
          }
        }
      }

      if (!confirmed) {
        i++; // Disconfirmed — skipped
        continue;
      }
    }

    const entryCandle = candles[entryBarIndex];
    const entryPrice = signalDir === "LONG"
      ? Number((entryCandle.close + spread / 2).toFixed(2)) // Ask fill
      : Number((entryCandle.close - spread / 2).toFixed(2)); // Bid fill

    // 4. Stop Loss & Take Profit Calculation
    let slDist: number;
    let stopLoss: number;

    if (featureStructuralStop) {
      // Anchored to the extreme of the last 10 candles
      const lookbackStart = Math.max(0, entryBarIndex - 10);
      const recent10 = candles.slice(lookbackStart, entryBarIndex + 1);

      if (signalDir === "LONG") {
        const lowestLow = Math.min(...recent10.map(c => c.low));
        const rawSl = lowestLow - (0.5 * atr) - spread;
        slDist = Math.max(3.5, Math.min(9.0, entryPrice - rawSl));
        stopLoss = Number((entryPrice - slDist).toFixed(2));
      } else {
        const highestHigh = Math.max(...recent10.map(c => c.high));
        const rawSl = highestHigh + (0.5 * atr) + spread;
        slDist = Math.max(3.5, Math.min(9.0, rawSl - entryPrice));
        stopLoss = Number((entryPrice + slDist).toFixed(2));
      }
    } else {
      // Legacy fixed 3.0 * ATR
      slDist = Math.max(3.5, Math.min(9.0, atr * 3.0));
      stopLoss = signalDir === "LONG"
        ? Number((entryPrice - slDist).toFixed(2))
        : Number((entryPrice + slDist).toFixed(2));
    }

    // 5. Spread Guard Check
    if (featureSpreadGuard) {
      const spreadRatio = slDist > 0 ? (spread / slDist) : 0;
      if (spreadRatio > 0.08 || spread > 0.60) {
        i = entryBarIndex + 1;
        continue;
      }
    }

    const tpDist = Number((slDist * tpRatio).toFixed(2));
    const takeProfit = signalDir === "LONG"
      ? Number((entryPrice + tpDist).toFixed(2))
      : Number((entryPrice - tpDist).toFixed(2));

    // Dynamic Sizing based on balance and risk %
    const riskAmount = balance * (riskPercent / 100);
    const riskPerPoint = (riskAmount / Math.max(slDist, 1.0)); // $ per point
    const lots = Math.max(0.01, Number(((riskPerPoint) / contractSize).toFixed(2)));

    // 6. Simulate forward bars
    let tradeExitPrice = entryPrice;
    let exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "END_OF_DATA" = "END_OF_DATA";
    let exitBarIndex = entryBarIndex;
    let maxAdverse = 0;
    let maxFavorable = 0;

    for (let j = entryBarIndex + 1; j < candles.length; j++) {
      const bar = candles[j];
      exitBarIndex = j;

      if (signalDir === "LONG") {
        const bidLow = bar.low - spread / 2;
        const bidHigh = bar.high - spread / 2;

        const currentAdverse = Math.max(0, entryPrice - bidLow);
        const currentFavorable = Math.max(0, bidHigh - entryPrice);
        if (currentAdverse > maxAdverse) maxAdverse = currentAdverse;
        if (currentFavorable > maxFavorable) maxFavorable = currentFavorable;

        if (bidLow <= stopLoss) {
          tradeExitPrice = stopLoss;
          exitReason = "STOP_LOSS";
          break;
        }
        if (bidHigh >= takeProfit) {
          tradeExitPrice = takeProfit;
          exitReason = "TAKE_PROFIT";
          break;
        }
      } else {
        const askHigh = bar.high + spread / 2;
        const askLow = bar.low + spread / 2;

        const currentAdverse = Math.max(0, askHigh - entryPrice);
        const currentFavorable = Math.max(0, entryPrice - askLow);
        if (currentAdverse > maxAdverse) maxAdverse = currentAdverse;
        if (currentFavorable > maxFavorable) maxFavorable = currentFavorable;

        if (askHigh >= stopLoss) {
          tradeExitPrice = stopLoss;
          exitReason = "STOP_LOSS";
          break;
        }
        if (askLow <= takeProfit) {
          tradeExitPrice = takeProfit;
          exitReason = "TAKE_PROFIT";
          break;
        }
      }
    }

    // Trade outcome calculation
    const rawPnlPoints = signalDir === "LONG"
      ? (tradeExitPrice - entryPrice)
      : (entryPrice - tradeExitPrice);
    const pnlPoints = Number(rawPnlPoints.toFixed(2));
    const pnlDollars = Number((pnlPoints * lots * contractSize).toFixed(2));
    const isWin = pnlPoints > 0;
    const rOutcome = Number((pnlPoints / Math.max(slDist, 1.0)).toFixed(2));

    balance = Number((balance + pnlDollars).toFixed(2));
    if (balance > peakBalance) peakBalance = balance;
    const currentDdDollars = Number((peakBalance - balance).toFixed(2));
    const currentDdPercent = Number(((currentDdDollars / peakBalance) * 100).toFixed(2));
    if (currentDdDollars > maxDrawdownDollars) maxDrawdownDollars = currentDdDollars;
    if (currentDdPercent > maxDrawdownPercent) maxDrawdownPercent = currentDdPercent;

    const exitCandle = candles[exitBarIndex];
    const durationMinutes = Math.max(5, Math.round((new Date(exitCandle.time).getTime() - new Date(entryCandle.time).getTime()) / 60000));

    const session = getSessionName(new Date(entryCandle.time).getUTCHours());
    const regime = rangeInfo.isRanging ? "RANGING" : "TRENDING";

    const tradeRecord: BacktestTrade = {
      id: `BT-${trades.length + 1}`,
      entryTime: new Date(entryCandle.time).toISOString(),
      exitTime: new Date(exitCandle.time).toISOString(),
      direction: signalDir,
      entryPrice,
      exitPrice: tradeExitPrice,
      stopLoss,
      takeProfit,
      pnlPoints,
      pnlDollars,
      outcome: isWin ? "WIN" : "LOSS",
      rOutcome,
      maePoints: Number(maxAdverse.toFixed(2)),
      mfePoints: Number(maxFavorable.toFixed(2)),
      maeR: Number((maxAdverse / slDist).toFixed(2)),
      mfeR: Number((maxFavorable / slDist).toFixed(2)),
      durationMinutes,
      pattern: patternName,
      session,
      regime,
      exitReason,
      balanceAfter: balance,
    };

    trades.push(tradeRecord);

    equityCurve.push({
      time: tradeRecord.exitTime,
      tradeIndex: trades.length,
      balance,
      equity: balance,
      drawdownDollars: currentDdDollars,
      drawdownPercent: currentDdPercent,
    });

    // Fast-forward cursor to exit bar + 1 to avoid overlapping multi-position collisions
    i = Math.max(entryBarIndex + 1, exitBarIndex);
  }

  // Aggregate metrics
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.outcome === "WIN");
  const losses = trades.filter(t => t.outcome === "LOSS");
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = totalTrades > 0 ? Number(((winCount / totalTrades) * 100).toFixed(1)) : 0;

  const grossProfit = wins.reduce((acc, t) => acc + t.pnlDollars, 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.pnlDollars, 0));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.0 : 0;

  const netProfitDollars = Number((balance - initialBalance).toFixed(2));
  const netProfitPercent = Number(((netProfitDollars / initialBalance) * 100).toFixed(2));
  const netProfitPoints = Number(trades.reduce((acc, t) => acc + t.pnlPoints, 0).toFixed(2));

  const totalR = trades.reduce((acc, t) => acc + t.rOutcome, 0);
  const expectancyR = totalTrades > 0 ? Number((totalR / totalTrades).toFixed(3)) : 0;

  const avgWinDollars = winCount > 0 ? Number((grossProfit / winCount).toFixed(2)) : 0;
  const avgLossDollars = lossCount > 0 ? Number((grossLoss / lossCount).toFixed(2)) : 0;
  const avgWinPoints = winCount > 0 ? Number((wins.reduce((a, t) => a + t.pnlPoints, 0) / winCount).toFixed(2)) : 0;
  const avgLossPoints = lossCount > 0 ? Number((Math.abs(losses.reduce((a, t) => a + t.pnlPoints, 0)) / lossCount).toFixed(2)) : 0;
  const winLossRatio = avgLossDollars > 0 ? Number((avgWinDollars / avgLossDollars).toFixed(2)) : 0;

  // Streak calculations
  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  for (const t of trades) {
    if (t.outcome === "WIN") {
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecWins) maxConsecWins = curWins;
    } else {
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecLosses) maxConsecLosses = curLosses;
    }
  }

  // Simple Sharpe Ratio estimate
  const returns = trades.map(t => t.pnlDollars / initialBalance);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? Number(((meanReturn / stdDev) * Math.sqrt(252)).toFixed(2)) : 0;

  const avgDuration = totalTrades > 0
    ? Math.round(trades.reduce((acc, t) => acc + t.durationMinutes, 0) / totalTrades)
    : 0;

  // Helper for category breakdowns
  function buildCategoryBreakdown(groupName: string, items: BacktestTrade[]): CategoryBreakdown {
    const tCount = items.length;
    const w = items.filter(t => t.outcome === "WIN");
    const l = items.filter(t => t.outcome === "LOSS");
    const wRate = tCount > 0 ? Number(((w.length / tCount) * 100).toFixed(1)) : 0;
    const netPts = Number(items.reduce((acc, t) => acc + t.pnlPoints, 0).toFixed(2));
    const netDls = Number(items.reduce((acc, t) => acc + t.pnlDollars, 0).toFixed(2));
    const gp = w.reduce((acc, t) => acc + t.pnlDollars, 0);
    const gl = Math.abs(l.reduce((acc, t) => acc + t.pnlDollars, 0));
    const pf = gl > 0 ? Number((gp / gl).toFixed(2)) : gp > 0 ? 99.0 : 0;
    const expR = tCount > 0 ? Number((items.reduce((acc, t) => acc + t.rOutcome, 0) / tCount).toFixed(3)) : 0;

    return {
      name: groupName,
      totalTrades: tCount,
      wins: w.length,
      losses: l.length,
      winRate: wRate,
      netPnlPoints: netPts,
      netPnlDollars: netDls,
      profitFactor: pf,
      expectancyR: expR,
    };
  }

  // Session breakdown
  const sessionGroups = ["London", "New York", "London/NY Overlap", "Asian", "Off-hours"] as const;
  const breakdownBySession = sessionGroups
    .map(s => buildCategoryBreakdown(s, trades.filter(t => t.session === s)))
    .filter(b => b.totalTrades > 0);

  // Pattern breakdown
  const uniquePatterns = Array.from(new Set(trades.map(t => t.pattern)));
  const breakdownByPattern = uniquePatterns
    .map(p => buildCategoryBreakdown(p, trades.filter(t => t.pattern === p)))
    .sort((a, b) => b.totalTrades - a.totalTrades);

  // Regime breakdown
  const breakdownByRegime = ["TRENDING", "RANGING"]
    .map(r => buildCategoryBreakdown(r, trades.filter(t => t.regime === r)))
    .filter(b => b.totalTrades > 0);

  // Direction breakdown
  const breakdownByDirection = ["LONG", "SHORT"]
    .map(d => buildCategoryBreakdown(d, trades.filter(t => t.direction === d)))
    .filter(b => b.totalTrades > 0);

  return {
    summary: {
      totalTrades,
      winningTrades: winCount,
      losingTrades: lossCount,
      winRate,
      initialBalance,
      finalBalance: balance,
      netProfitDollars,
      netProfitPercent,
      netProfitPoints,
      profitFactor,
      expectancyR,
      maxDrawdownDollars,
      maxDrawdownPercent,
      averageWinDollars: avgWinDollars,
      averageLossDollars: avgLossDollars,
      averageWinPoints: avgWinPoints,
      averageLossPoints: avgLossPoints,
      winLossRatio,
      sharpeRatio,
      maxConsecutiveWins: maxConsecWins,
      maxConsecutiveLosses: maxConsecLosses,
      avgTradeDurationMinutes: avgDuration,
      candlesEvaluated: count,
      timeframe: tf,
      dataSource: "MetaApi Historical Cloud Feed",
    },
    breakdownBySession,
    breakdownByPattern,
    breakdownByRegime,
    breakdownByDirection,
    equityCurve,
    trades: trades.slice(-300), // Return up to 300 recent detailed trades
    testedParams: params,
  };
}
