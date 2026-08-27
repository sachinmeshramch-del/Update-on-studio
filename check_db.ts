import { getRecentSignals } from "@workspace/db";
async function main() {
  const s = await getRecentSignals(50);
  console.log(s.map(i => `${i.createdAt.toISOString()} | ${i.signal} | ${i.tradeStatus} | entry: ${i.entryPrice} | sl: ${i.stopLoss}`).join('\n'));
}
main();
