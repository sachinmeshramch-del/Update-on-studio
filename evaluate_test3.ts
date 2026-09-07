import { generateSignal } from "./artifacts/api-server/src/lib/signalEngine.ts";
async function run() {
  const sig = await generateSignal(2500, false);
  console.log(JSON.stringify(sig.signal));
  process.exit(0);
}
run();
