import { generateSignal } from './artifacts/api-server/dist/lib/signalEngine.mjs';
import { fetchLatestPrice } from './artifacts/api-server/dist/lib/binanceClient.mjs';

async function run() {
    const p = await fetchLatestPrice();
    const sig = await generateSignal(p);
    console.log(JSON.stringify(sig, null, 2));
    process.exit(0);
}
run();
