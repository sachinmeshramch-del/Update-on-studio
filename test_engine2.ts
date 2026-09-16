import { calculateSignal } from "./artifacts/api-server/src/lib/signalEngine.js";

async function run() {
    try {
        const sig = await calculateSignal();
        console.log(JSON.stringify(sig, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
