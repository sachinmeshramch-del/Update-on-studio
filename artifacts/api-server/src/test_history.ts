import { getRecentSignals } from "@workspace/db";
async function run() {
  const signals = await getRecentSignals(5);
  console.log(JSON.stringify(signals, null, 2));
}
run();
