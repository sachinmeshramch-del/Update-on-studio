import { generateSignal } from "./artifacts/api-server/src/lib/signalEngine.ts";
async function run() {
  const sig = await generateSignal(4405, true);
  console.log(sig);
  process.exit(0);
}
run();
