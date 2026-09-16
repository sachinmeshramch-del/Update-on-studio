import { generateSignal } from "./artifacts/api-server/src/lib/signalEngine.js";
import { getLatestPrice } from "./artifacts/api-server/src/lib/priceEvents.js";

async function run() {
    try {
        const p = getLatestPrice();
        if (!p) {
            console.log("No price yet");
            return;
        }
        const sig = await generateSignal(p.price, false);
        console.log(JSON.stringify(sig, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
