import { getRecentSignals } from "@workspace/db";
async function check() {
  const signals = await getRecentSignals(20);
  console.log(signals.map(s => `${s.createdAt} | ${s.signal} | ${s.tradeStatus} | PnL: ${s.pnlPoints}`).join('\n'));
}
check();
