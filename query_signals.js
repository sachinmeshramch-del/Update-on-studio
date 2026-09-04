import { getRecentSignals } from './lib/db/dist/dao.js';
async function run() {
  const signals = await getRecentSignals(50);
  for (const s of signals) {
    console.log(s.createdAt, s.signal, s.signalType, s.reason);
  }
  process.exit(0);
}
run();
