import { generateSignal } from "./artifacts/api-server/src/lib/signalEngine.ts";
async function run() {
  const sig = await generateSignal(4405, false);
  console.log(JSON.stringify(sig.signal));
  console.log(JSON.stringify(sig.reason));
  process.exit(0);
}
run();
