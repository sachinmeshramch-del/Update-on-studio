import { evaluateSignal } from "./artifacts/api-server/src/lib/signalEngine.ts";
async function test() {
   const sig = await evaluateSignal(false);
   console.log(sig);
}
test();
