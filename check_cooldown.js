import { generateSignal } from './dist/lib/signalEngine.js';

async function run() {
  const signal = await generateSignal(4280.00, false);
  console.log("cooldownRemaining", signal.cooldownRemaining);
  console.log("reason", signal.reason);
}
run();
