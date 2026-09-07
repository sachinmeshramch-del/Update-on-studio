const { getMetaApiHistoricalOHLC } = require("./artifacts/api-server/dist/lib/metaApiFeed.js");
async function run() {
  try {
     console.log("Fetching 15m...");
     const candles = await getMetaApiHistoricalOHLC("15m", 100);
     console.log("Got " + candles.length + " candles");
     console.log(candles[candles.length - 1]);
  } catch(e) {
     console.error("ERROR:", e);
  }
}
run();
