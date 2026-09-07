import { generateSignal } from "./artifacts/api-server/src/lib/signalEngine.ts";
async function run() {
  console.log("Evaluating...");
  const sig = await generateSignal(2600, false);
  console.log(JSON.stringify(sig, null, 2));
  process.exit(0);
}
run();
