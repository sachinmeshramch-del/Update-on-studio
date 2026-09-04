import { generateSignal } from './dist/lib/signalEngine.js';
import { fetchLatestPrice } from './dist/lib/binanceClient.js';
import { db } from './dist/lib/firebase.js';

async function runDiag() {
  try {
    const price = await fetchLatestPrice();
    console.log("Current price:", price);
    const signal = await generateSignal(price, false);
    console.log("Generated signal:", JSON.stringify(signal, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Error running diag:", err);
    process.exit(1);
  }
}
runDiag();
