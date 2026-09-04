import { OHLCCandle } from "./goldPrice.js";
import {
  calcEMA, calcRSI, calcMACD, calcATR
} from "./technicalIndicators.js";

// A pure functional adaptation of the signalEngine scoring logic for backtesting
export interface BacktestParams {
  candles: OHLCCandle[];
  balance: number;
  riskPerTradePercent: number;
  positionSizing: "risk" | "fixed";
  fixedLotSize?: number;
}

export interface BacktestTrade {
  entryTime: string;
  exitTime?: string;
  type: "LONG" | "SHORT";
  entryPrice: number;
  sl: number;
  tp: number;
  exitPrice?: number;
  pnl?: number;
  status: "OPEN" | "WIN" | "LOSS";
  confidence: number;
  lotSize?: number;
}

export interface BacktestResult {
  projectedMonthlyPnl: number;
  durationDays: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  initialBalance: number;
  finalBalance: number;
  totalPnl: number;
  profitFactor: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
}

export function runBacktest(params: BacktestParams): BacktestResult {
  const { candles, balance, riskPerTradePercent, positionSizing, fixedLotSize } = params;
  
  let currentBalance = balance;
  let peakBalance = balance;
  let maxDrawdown = 0;
  
  const trades: BacktestTrade[] = [];
  let openTrade: BacktestTrade | null = null;
  
  let grossProfit = 0;
  let grossLoss = 0;

  const CONTRACT_SIZE = 100; // 1 standard lot = 100 oz for XAUUSD
  
  // We need at least 100 candles of history for indicators to warm up
  for (let i = 100; i < candles.length; i++) {
    const currentCandle = candles[i];
    
    // 1. Check if we have an open trade to close
    if (openTrade) {
      // Check SL / TP
      if (openTrade.type === "LONG") {
        if (currentCandle.low <= openTrade.sl) {
          // Stopped out
          openTrade.exitPrice = openTrade.sl;
          openTrade.status = "LOSS";
        } else if (currentCandle.high >= openTrade.tp) {
          // Target hit
          openTrade.exitPrice = openTrade.tp;
          openTrade.status = "WIN";
        }
      } else {
        if (currentCandle.high >= openTrade.sl) {
          // Stopped out
          openTrade.exitPrice = openTrade.sl;
          openTrade.status = "LOSS";
        } else if (currentCandle.low <= openTrade.tp) {
          // Target hit
          openTrade.exitPrice = openTrade.tp;
          openTrade.status = "WIN";
        }
      }
      
      if (openTrade.status !== "OPEN") {
        openTrade.exitTime = new Date(currentCandle.time * 1000).toISOString();
        const priceDiff = openTrade.type === "LONG" 
            ? openTrade.exitPrice! - openTrade.entryPrice 
            : openTrade.entryPrice - openTrade.exitPrice!;
            
        // Calculate Lot Size
        let lotSize = 0;
        if (positionSizing === "fixed" && fixedLotSize) {
          lotSize = fixedLotSize;
        } else {
          // Dynamic based on risk
          const riskAmount = currentBalance * (riskPerTradePercent / 100);
          const riskPerOz = Math.abs(openTrade.entryPrice - openTrade.sl);
          if (riskPerOz > 0) {
            lotSize = riskAmount / (riskPerOz * CONTRACT_SIZE);
          }
          // Round to nearest 0.01 lot
          lotSize = Math.round(lotSize * 100) / 100;
          // Min lot 0.01
          lotSize = Math.max(0.01, lotSize);
        }

        const units = lotSize * CONTRACT_SIZE;
        openTrade.lotSize = lotSize;
        openTrade.pnl = priceDiff * units;
        
        if (openTrade.pnl > 0) grossProfit += openTrade.pnl;
        else grossLoss += Math.abs(openTrade.pnl);
        
        currentBalance += openTrade.pnl;
        
        if (currentBalance > peakBalance) peakBalance = currentBalance;
        const drawdown = (peakBalance - currentBalance) / peakBalance;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        
        trades.push({...openTrade});
        openTrade = null;
      }
    }
    
    // 2. If no open trade, look for entries
    if (!openTrade) {
      // Create a snapshot of history up to 'i'
      const history5m = candles.slice(i - 100, i + 1);
      
      const closes = history5m.map(c => c.close);
      const ema9 = calcEMA(closes, 9);
      const ema21 = calcEMA(closes, 21);
      const rsi = calcRSI(closes, 14);
      const macd = calcMACD(closes);
      const atrArr = calcATR(history5m, 14);
      
      const currEma9 = ema9[ema9.length - 1];
      const currEma21 = ema21[ema21.length - 1];
      const currRsi = rsi[rsi.length - 1];
      const currMacdHist = macd.histogram[macd.histogram.length - 1];
      const prevMacdHist = macd.histogram[macd.histogram.length - 2];
      const currAtr = atrArr[atrArr.length - 1];
      
      let longScore = 0;
      let shortScore = 0;
      
      if (currEma9 > currEma21) longScore += 30;
      if (currEma9 < currEma21) shortScore += 30;
      
      if (currRsi > 40 && currRsi < 60) longScore += 20;
      if (currRsi > 40 && currRsi < 60) shortScore += 20;
      if (currRsi > 78) longScore = 0; // exhaustion
      if (currRsi < 22) shortScore = 0; // exhaustion
      
      if (currMacdHist > 0 && currMacdHist > prevMacdHist) longScore += 25;
      if (currMacdHist < 0 && currMacdHist < prevMacdHist) shortScore += 25;
      
      if (longScore >= 65 && longScore > shortScore) {
        openTrade = {
          entryTime: new Date(currentCandle.time * 1000).toISOString(),
          type: "LONG",
          entryPrice: currentCandle.close,
          sl: currentCandle.close - (currAtr * 1.5),
          tp: currentCandle.close + (currAtr * 2.5),
          status: "OPEN",
          confidence: longScore
        };
      } else if (shortScore >= 65 && shortScore > longScore) {
        openTrade = {
          entryTime: new Date(currentCandle.time * 1000).toISOString(),
          type: "SHORT",
          entryPrice: currentCandle.close,
          sl: currentCandle.close + (currAtr * 1.5),
          tp: currentCandle.close - (currAtr * 2.5),
          status: "OPEN",
          confidence: shortScore
        };
      }
    }
  }
  
  const wins = trades.filter(t => t.status === "WIN").length;
  const losses = trades.filter(t => t.status === "LOSS").length;
  

  const firstCandleTime = candles.length > 0 ? candles[0].time : 0;
  const lastCandleTime = candles.length > 0 ? candles[candles.length - 1].time : 0;
  const durationDays = (lastCandleTime - firstCandleTime) / (60 * 60 * 24);
  const projectedMonthlyPnl = durationDays > 0 ? (currentBalance - balance) * (30 / durationDays) : 0;

  return {
    projectedMonthlyPnl,
    durationDays,
    totalTrades: trades.length,
    wins,
    losses,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    initialBalance: balance,
    finalBalance: currentBalance,
    totalPnl: currentBalance - balance,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0),
    maxDrawdown: maxDrawdown * 100,
    trades: trades.slice().reverse() // newest first
  };
}
