import { getRecentSignals } from "@workspace/db";
const signals = await getRecentSignals(15);
signals.forEach(r => console.log(`${r.id} | ${r.signal} | ${r.tradeStatus} | entry: ${r.entryPrice} | sl: ${r.stopLoss} | tp: ${r.takeProfit} | ${r.createdAt}`));
process.exit(0);
