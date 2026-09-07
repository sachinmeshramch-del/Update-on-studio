const { evaluateSignal } = require("./artifacts/api-server/dist/lib/signalEngine.js");
async function test() {
   const sig = await evaluateSignal(false);
   console.log(JSON.stringify(sig, null, 2));
}
test().catch(console.error);
