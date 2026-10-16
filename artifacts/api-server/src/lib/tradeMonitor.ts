import { getRunningTrades, getClosedTrades } from "@workspace/db";
import { logger } from "./logger.js";
import fs from "fs";

let initialClosedTradeIds = new Set<string>();
let trackedTrades = new Map<string, any>();
let initialized = false;
let completedCount = 0;
const MAX_TRADES = 5;

export function startDiagnosticMonitor() {
  logger.info("[Diagnostic Monitor] Starting up. Will track execution and SL triggers for the next 5 trades.");
  
  setInterval(async () => {
    try {
      if (!initialized) {
        const closed = await getClosedTrades(100);
        closed.forEach(t => initialClosedTradeIds.add(t.id));
        initialized = true;
        return;
      }

      if (completedCount >= MAX_TRADES) return;

      const running = await getRunningTrades();
      
      // Track Trailing Stop-Loss Changes in Real-Time
      for (const trade of running) {
        if (!trackedTrades.has(trade.id)) {
          trackedTrades.set(trade.id, {
            id: trade.id,
            signal: trade.signal,
            entryPrice: trade.entryPrice,
            initialSl: trade.stopLoss,
            slUpdates: []
          });
          logger.info({ tradeId: trade.id, entry: trade.entryPrice }, "[Diagnostic Monitor] Discovered new live trade to track.");
        } else {
          const tracker = trackedTrades.get(trade.id);
          const currentSl = trade.stopLoss;
          const lastSl = tracker.slUpdates.length > 0 ? tracker.slUpdates[tracker.slUpdates.length - 1].sl : tracker.initialSl;
          
          if (currentSl > 0 && Math.abs(currentSl - lastSl) > 0.001) {
            tracker.slUpdates.push({ time: new Date().toISOString(), sl: currentSl });
            logger.info({ tradeId: trade.id, oldSl: lastSl, newSl: currentSl }, "[Diagnostic Monitor] 🎯 Trailing Stop-Loss Trigger Detected & Captured");
          }
        }
      }

      // Check for Completions
      const closed = await getClosedTrades(20);
      for (const trade of closed) {
        if (!initialClosedTradeIds.has(trade.id) && !trackedTrades.get(trade.id)?.completed) {
          const tracker = trackedTrades.get(trade.id) || { 
            id: trade.id, 
            signal: trade.signal, 
            entryPrice: trade.entryPrice, 
            initialSl: trade.stopLoss,
            slUpdates: [] 
          };
          
          tracker.completed = true;
          tracker.exitPrice = trade.closedPrice;
          tracker.pnl = trade.pnlPoints;
          tracker.closedAt = trade.createdAt;
          trackedTrades.set(trade.id, tracker);
          completedCount++;
          
          logger.info({
            tradeId: trade.id,
            signal: trade.signal,
            entryPrice: trade.entryPrice,
            exitPrice: trade.closedPrice,
            pnlPoints: trade.pnlPoints,
            totalSlMoves: tracker.slUpdates.length,
            slHistory: tracker.slUpdates
          }, `[Diagnostic Monitor] ✅ Trade ${completedCount}/${MAX_TRADES} Fully Completed & Logged.`);
          
          if (completedCount >= MAX_TRADES) {
             const summaryPath = "/tmp/diagnostic_summary.json";
             const finalData = Array.from(trackedTrades.values()).filter(t => t.completed);
             fs.writeFileSync(summaryPath, JSON.stringify(finalData, null, 2));
             logger.info(`[Diagnostic Monitor] 🎉 All 5 trades captured successfully. Diagnostic report saved to ${summaryPath}`);
          }
        }
      }
    } catch (e) {
      logger.error({ err: String(e) }, "[Diagnostic Monitor] Error in monitoring loop");
    }
  }, 2000); // Check every 2 seconds
}
