import { insertSignal } from '@workspace/db';

async function run() {
  try {
    const res = await insertSignal({
      signal: "SHORT", confidence: 99, entryPrice: 100, stopLoss: 110, takeProfit: 90,
      trend: "BEARISH", reason: "TEST", tradeDuration: "5-30 minutes", tradeStatus: "RUNNING",
      closedPrice: null, closedAt: null, pnlPoints: null, marketStructure: null,
      bosPresent: null, liquiditySweep: null, inOrderBlock: null, smcScore: null,
      obScore: null, obType: null, obHigh: null, obLow: null, signalType: "RANGE",
      candlePattern: null, candleScore: null, isRealTrade: false
    });
    console.log("Success:", res);
  } catch(e) {
    console.error("Error inserting:", e);
  }
}
run();
