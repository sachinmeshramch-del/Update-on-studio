import { getMetaApiHistoricalOHLC } from "./artifacts/api-server/src/lib/metaApiFeed.ts";
async function run() {
  try {
     console.log("Fetching 15m...");
     const candles = await getMetaApiHistoricalOHLC("15m", 100);
     console.log("Got " + candles.length + " candles");
     console.log(candles[candles.length - 1]);
     process.exit(0);
  } catch(e) {
     console.error("ERROR:", e);
     process.exit(1);
  }
}
run();
