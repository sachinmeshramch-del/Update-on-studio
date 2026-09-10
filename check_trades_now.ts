import { getClosedTrades, getRunningTrades } from "./lib/db/src/dao";

async function run() {
  const closed = await getClosedTrades(10);
  const running = await getRunningTrades();
  console.log(JSON.stringify({
    closed: closed.slice(0, 5).map(t => ({ id: t.id, signal: t.signal, entryPrice: t.entryPrice, stopLoss: t.stopLoss, closedPrice: t.closedPrice, pnlPoints: t.pnlPoints, createdAt: t.createdAt })),
    running: running.map(r => ({ id: r.id, currentSl: r.stopLoss })),
  }, null, 2));
  process.exit(0);
}
run().catch(console.error);
