import { generateSignal } from "./artifacts/api-server/src/lib/signalEngine.js";
import { getLatestPrice } from "./artifacts/api-server/src/lib/priceEvents.js";
import { getLatestSignal, getRunningTrades } from "@workspace/db";

async function run() {
    try {
        const p = getLatestPrice();
        if (!p) {
             console.log("No price");
             return;
        }
        const sig = await generateSignal(p.price, true);
        console.log("Signal:", sig.signal, sig.reason);
        
        const latest = await getLatestSignal();
        console.log("Latest DB:", latest ? latest.signal : "none");
        
        const running = await getRunningTrades();
        console.log("Running DB:", running.length);
        
    } catch (e) {
        console.error(e);
    }
}
run();
