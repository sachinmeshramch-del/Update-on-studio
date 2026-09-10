import { getClosedTrades, getRunningTrades } from "./lib/db/src/dao";

async function run() {
  const closed = await getClosedTrades(10);
  const running = await getRunningTrades();
  
  // Try to read the tracked trades from the file if it exists, or just log DB state
  console.log(JSON.stringify({
    runningTrades: running.map(r => ({ id: r.id, currentSl: r.stopLoss, pnlPoints: r.pnlPoints })),
    recentClosed: closed.slice(0, 5).map(t => ({ id: t.id, signal: t.signal, entryPrice: t.entryPrice, stopLoss: t.stopLoss, closedPrice: t.closedPrice, pnlPoints: t.pnlPoints, createdAt: t.createdAt })),
    timestamp: Date.now()
  }, null, 2));
  process.exit(0);
}
run().catch(console.error);
