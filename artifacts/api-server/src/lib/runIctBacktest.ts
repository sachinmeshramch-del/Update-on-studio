import fs from "fs";
import path from "path";
import { OHLCCandle } from "./goldPrice.js";
import { IctSilverBulletEngine, DEFAULT_ICT_SILVER_BULLET_CONFIG, IctSilverBulletConfig } from "./ictSilverBulletEngine.js";

interface SimTrade {
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
  riskRewardRatio: number;
  session: string;
  durationMinutes: number;
}

interface PerformanceSummary {
  name: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalPnlPoints: number;
  totalPnlDollars: number;
  maxDrawdownPoints: number;
  maxDrawdownPct: number;
  profitFactor: number;
  avgWinPoints: number;
  avgLossPoints: number;
  sharpeRatio: number;
  trades: SimTrade[];
}

export function runIctEngineSimulation(
  candles: OHLCCandle[],
  configOverrides: Partial<IctSilverBulletConfig> = {},
  initialBalance = 1000,
  spread = 0.40
): PerformanceSummary {
  const engine = new IctSilverBulletEngine(configOverrides);
  const trades: SimTrade[] = [];

  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdownDollars = 0;
  let maxDrawdownPct = 0;

  let activeTrade: {
    id: string;
    entryBarIndex: number;
    entryTime: string;
    direction: "LONG" | "SHORT";
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    rr: number;
    session: string;
  } | null = null;

  const warmup = 50;

  for (let i = warmup; i < candles.length; i++) {
    const curr = candles[i];
function parseTimeIso(t: any): string {
  if (typeof t === "number") {
    return new Date(t > 1e11 ? t : t * 1000).toISOString();
  }
  if (typeof t === "string") {
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d.toISOString();
    const parsedNum = Number(t);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      return new Date(parsedNum > 1e11 ? parsedNum : parsedNum * 1000).toISOString();
    }
  }
  return new Date().toISOString();
}

    const currTime = parseTimeIso(curr.time);

    // 1. Manage active position if open
    if (activeTrade) {
      let hitSL = false;
      let hitTP = false;
      let exitPrice = activeTrade.entryPrice;

      if (activeTrade.direction === "LONG") {
        if (curr.low <= activeTrade.stopLoss) {
          hitSL = true;
          exitPrice = activeTrade.stopLoss;
        } else if (curr.high >= activeTrade.takeProfit) {
          hitTP = true;
          exitPrice = activeTrade.takeProfit;
        }
      } else {
        if (curr.high >= activeTrade.stopLoss) {
          hitSL = true;
          exitPrice = activeTrade.stopLoss;
        } else if (curr.low <= activeTrade.takeProfit) {
          hitTP = true;
          exitPrice = activeTrade.takeProfit;
        }
      }

      if (hitSL || hitTP) {
        const pnlPts = activeTrade.direction === "LONG"
          ? +(exitPrice - activeTrade.entryPrice).toFixed(2)
          : +(activeTrade.entryPrice - exitPrice).toFixed(2);
        
        // Sizing: 0.5% risk ($5 on $1000 balance)
        const riskPoints = Math.abs(activeTrade.entryPrice - activeTrade.stopLoss);
        const lotSize = (balance * (engine.getConfig().riskPerTradePercent / 100)) / (riskPoints * 100);
        const pnlDollars = +(pnlPts * lotSize * 100).toFixed(2);

        balance += pnlDollars;
        if (balance > peakBalance) peakBalance = balance;
        const dd = peakBalance - balance;
        const ddPct = (dd / peakBalance) * 100;
        if (dd > maxDrawdownDollars) maxDrawdownDollars = dd;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        const entryDate = new Date(activeTrade.entryTime).getTime();
        const exitDate = new Date(currTime).getTime();
        const durationMinutes = Math.max(15, Math.round((exitDate - entryDate) / (60 * 1000)));

        trades.push({
          id: activeTrade.id,
          entryTime: activeTrade.entryTime,
          exitTime: currTime,
          direction: activeTrade.direction,
          entryPrice: activeTrade.entryPrice,
          exitPrice,
          stopLoss: activeTrade.stopLoss,
          takeProfit: activeTrade.takeProfit,
          pnlPoints: pnlPts,
          pnlDollars,
          outcome: pnlPts > 0 ? "WIN" : "LOSS",
          riskRewardRatio: activeTrade.rr,
          session: activeTrade.session,
          durationMinutes,
        });

        activeTrade = null;
        engine.resetState();
      }
    }

    // 2. Evaluate engine for new setup entry signal if no position is active
    if (!activeTrade) {
      const evalRes = engine.evaluateCandle(curr.close, spread, candles, i, balance);
      if (evalRes && evalRes.isTradeReady) {
        activeTrade = {
          id: `TRADE_${trades.length + 1}_${i}`,
          entryBarIndex: i,
          entryTime: currTime,
          direction: evalRes.signal,
          entryPrice: evalRes.entryPrice,
          stopLoss: evalRes.stopLoss,
          takeProfit: evalRes.takeProfit,
          rr: evalRes.riskRewardRatio,
          session: evalRes.setup.sessionName,
        };
      }
    }
  }

  const totalTrades = trades.length;
  const wins = trades.filter(t => t.outcome === "WIN").length;
  const losses = trades.filter(t => t.outcome === "LOSS").length;
  const winRatePct = totalTrades > 0 ? +((wins / totalTrades) * 100).toFixed(1) : 0;

  const totalPnlPoints = +trades.reduce((acc, t) => acc + t.pnlPoints, 0).toFixed(2);
  const totalPnlDollars = +trades.reduce((acc, t) => acc + t.pnlDollars, 0).toFixed(2);

  const winPointsArr = trades.filter(t => t.outcome === "WIN").map(t => t.pnlPoints);
  const lossPointsArr = trades.filter(t => t.outcome === "LOSS").map(t => t.pnlPoints);

  const avgWinPoints = winPointsArr.length > 0 ? +(winPointsArr.reduce((a, b) => a + b, 0) / winPointsArr.length).toFixed(2) : 0;
  const avgLossPoints = lossPointsArr.length > 0 ? +(Math.abs(lossPointsArr.reduce((a, b) => a + b, 0)) / lossPointsArr.length).toFixed(2) : 0;

  const grossWinDollars = trades.filter(t => t.outcome === "WIN").reduce((a, t) => a + t.pnlDollars, 0);
  const grossLossDollars = Math.abs(trades.filter(t => t.outcome === "LOSS").reduce((a, t) => a + t.pnlDollars, 0));
  const profitFactor = grossLossDollars > 0 ? +(grossWinDollars / grossLossDollars).toFixed(2) : grossWinDollars > 0 ? 99.0 : 0;

  // Simple Sharpe estimate based on trade return sequence
  const returns = trades.map(t => t.pnlDollars);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1) : 1;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? +((meanReturn / stdDev) * Math.sqrt(252)).toFixed(2) : 0;

  const maxDrawdownPoints = +trades.reduce((maxDD, _, idx) => {
    const sub = trades.slice(0, idx + 1);
    const cum = sub.reduce((acc, t) => acc + t.pnlPoints, 0);
    const peak = Math.max(0, ...sub.map((_, i2) => sub.slice(0, i2 + 1).reduce((a, t) => a + t.pnlPoints, 0)));
    return Math.max(maxDD, peak - cum);
  }, 0).toFixed(2);

  return {
    name: "ICT Silver Bullet Engine",
    totalTrades,
    wins,
    losses,
    winRatePct,
    totalPnlPoints,
    totalPnlDollars,
    maxDrawdownPoints,
    maxDrawdownPct: +maxDrawdownPct.toFixed(2),
    profitFactor,
    avgWinPoints,
    avgLossPoints,
    sharpeRatio,
    trades,
  };
}

export function executeFullBacktestSuite(): void {
  const dataPath = path.resolve(process.cwd(), ".historical_data", "GOLD_15m.json");
  if (!fs.existsSync(dataPath)) {
    console.error(`Data file not found at ${dataPath}`);
    return;
  }

  const raw = fs.readFileSync(dataPath, "utf-8");
  const candles: OHLCCandle[] = JSON.parse(raw);
  console.log(`Loaded ${candles.length} candles for ICT Silver Bullet backtesting.`);

  // Chronological Out-of-Sample Split
  const totalCandles = candles.length;
  const trainSplitIdx = Math.floor(totalCandles * 0.50);
  const valSplitIdx = Math.floor(totalCandles * 0.75);

  const trainCandles = candles.slice(0, trainSplitIdx);
  const valCandles = candles.slice(trainSplitIdx, valSplitIdx);
  const testCandles = candles.slice(valSplitIdx);

  console.log(`Train Set: ${trainCandles.length} candles | Validation Set: ${valCandles.length} candles | Test (OOS) Set: ${testCandles.length} candles`);

  // 1. Primary Rebuilt Engine Baseline (NY Morning Window 10-11 AM NY Time)
  const nyMorningResults = runIctEngineSimulation(candles, {
    enabledSessions: { nyMorning: true, londonMorning: false, nyAfternoon: false },
    entryModel: "FVG_MIDPOINT_50",
    minRiskRewardRatio: 1.5,
  });

  // 2. Session Window Comparisons
  const londonMorningResults = runIctEngineSimulation(candles, {
    enabledSessions: { nyMorning: false, londonMorning: true, nyAfternoon: false },
    entryModel: "FVG_MIDPOINT_50",
    minRiskRewardRatio: 1.5,
  });

  const nyAfternoonResults = runIctEngineSimulation(candles, {
    enabledSessions: { nyMorning: false, londonMorning: false, nyAfternoon: true },
    entryModel: "FVG_MIDPOINT_50",
    minRiskRewardRatio: 1.5,
  });

  const allWindowsResults = runIctEngineSimulation(candles, {
    enabledSessions: { nyMorning: true, londonMorning: true, nyAfternoon: true },
    entryModel: "FVG_MIDPOINT_50",
    minRiskRewardRatio: 1.5,
  });

  // 3. Entry Model Comparisons
  const entryEdgeResults = runIctEngineSimulation(candles, {
    enabledSessions: { nyMorning: true, londonMorning: false, nyAfternoon: false },
    entryModel: "FVG_RETRACEMENT_EDGE",
    minRiskRewardRatio: 1.5,
  });

  const entryCustomDepthResults = runIctEngineSimulation(candles, {
    enabledSessions: { nyMorning: true, londonMorning: false, nyAfternoon: false },
    entryModel: "FVG_CUSTOM_DEPTH",
    fvgCustomRetracementDepthPct: 0.75,
    minRiskRewardRatio: 1.5,
  });

  // 4. Out-of-Sample Performance Splits
  const trainResults = runIctEngineSimulation(trainCandles, { enabledSessions: { nyMorning: true, londonMorning: false, nyAfternoon: false } });
  const valResults = runIctEngineSimulation(valCandles, { enabledSessions: { nyMorning: true, londonMorning: false, nyAfternoon: false } });
  const oosResults = runIctEngineSimulation(testCandles, { enabledSessions: { nyMorning: true, londonMorning: false, nyAfternoon: false } });

  console.log("\n=========================================================");
  console.log("    ICT SILVER BULLET REBUILT ENGINE BACKTEST RESULTS    ");
  console.log("=========================================================");
  console.log(`Primary NY Morning (10-11 AM NY Time):`);
  console.log(`  Trades: ${nyMorningResults.totalTrades} | Win Rate: ${nyMorningResults.winRatePct}% | PnL: +${nyMorningResults.totalPnlPoints} pts ($${nyMorningResults.totalPnlDollars})`);
  console.log(`  Max Drawdown: ${nyMorningResults.maxDrawdownPoints} pts (${nyMorningResults.maxDrawdownPct}%) | Profit Factor: ${nyMorningResults.profitFactor} | Sharpe: ${nyMorningResults.sharpeRatio}`);

  console.log("\n--- Session Window Ablation Matrix ---");
  console.log(`  London Morning (3-4 AM NY): Trades: ${londonMorningResults.totalTrades} | Win Rate: ${londonMorningResults.winRatePct}% | PnL: +${londonMorningResults.totalPnlPoints} pts | Max DD: ${londonMorningResults.maxDrawdownPct}%`);
  console.log(`  NY Afternoon (2-3 PM NY):   Trades: ${nyAfternoonResults.totalTrades} | Win Rate: ${nyAfternoonResults.winRatePct}% | PnL: +${nyAfternoonResults.totalPnlPoints} pts | Max DD: ${nyAfternoonResults.maxDrawdownPct}%`);
  console.log(`  Combined All 3 Windows:    Trades: ${allWindowsResults.totalTrades} | Win Rate: ${allWindowsResults.winRatePct}% | PnL: +${allWindowsResults.totalPnlPoints} pts | Max DD: ${allWindowsResults.maxDrawdownPct}%`);

  console.log("\n--- Entry Model Ablation Matrix ---");
  console.log(`  FVG Edge Entry:         Trades: ${entryEdgeResults.totalTrades} | Win Rate: ${entryEdgeResults.winRatePct}% | PnL: +${entryEdgeResults.totalPnlPoints} pts | Max DD: ${entryEdgeResults.maxDrawdownPct}%`);
  console.log(`  FVG 50% Midpoint Entry: Trades: ${nyMorningResults.totalTrades} | Win Rate: ${nyMorningResults.winRatePct}% | PnL: +${nyMorningResults.totalPnlPoints} pts | Max DD: ${nyMorningResults.maxDrawdownPct}%`);
  console.log(`  FVG 75% Custom Depth:   Trades: ${entryCustomDepthResults.totalTrades} | Win Rate: ${entryCustomDepthResults.winRatePct}% | PnL: +${entryCustomDepthResults.totalPnlPoints} pts | Max DD: ${entryCustomDepthResults.maxDrawdownPct}%`);

  console.log("\n--- Out-Of-Sample (OOS) Validation Splits ---");
  console.log(`  In-Sample Train (50%):      Trades: ${trainResults.totalTrades} | Win Rate: ${trainResults.winRatePct}% | PnL: +${trainResults.totalPnlPoints} pts | Max DD: ${trainResults.maxDrawdownPct}%`);
  console.log(`  Validation Set (25%):        Trades: ${valResults.totalTrades} | Win Rate: ${valResults.winRatePct}% | PnL: +${valResults.totalPnlPoints} pts | Max DD: ${valResults.maxDrawdownPct}%`);
  console.log(`  Out-Of-Sample Test (25%):   Trades: ${oosResults.totalTrades} | Win Rate: ${oosResults.winRatePct}% | PnL: +${oosResults.totalPnlPoints} pts | Max DD: ${oosResults.maxDrawdownPct}%`);
  console.log("=========================================================\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  executeFullBacktestSuite();
}
