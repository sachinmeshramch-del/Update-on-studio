import { generateSignal } from "./artifacts/api-server/dist/lib/signalEngine.mjs";
async function run() {
  try {
     const sig = await generateSignal(false);
     console.log(JSON.stringify(sig, null, 2));
  } catch (e) {
     console.error(e);
  }
}
run();
