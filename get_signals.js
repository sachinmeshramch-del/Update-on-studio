import { getRecentSignals } from "@workspace/db";
async function run() {
  const sigs = await getRecentSignals(10);
  require('fs').writeFileSync('recent_signals.json', JSON.stringify(sigs, null, 2));
  process.exit(0);
}
run();
