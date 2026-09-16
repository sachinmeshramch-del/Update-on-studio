const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    const live  = getLatestPrice();
    const price = live?.price;
    if (!price || !live) {
      logger.warn("Skipping signal evaluation: no live price available");
      return;
    }`;

const replace = `    let live  = getLatestPrice();
    if (!live) {
      try {
        const { getMetaApiHistoricalOHLC } = await import("./metaApiFeed.js");
        const recent = await getMetaApiHistoricalOHLC("1m", 1);
        if (recent && recent.length > 0) {
            const c = recent[recent.length - 1];
            live = {
                price: c.close,
                bid: c.close,
                ask: c.close,
                spread: 20,
                change: 0,
                changePercent: 0,
                high24h: c.high,
                low24h: c.low,
                timestamp: new Date().toISOString(),
                direction: "unchanged",
                ms: Date.now(),
                source: "metaapi"
            };
            // Seed the emitter so it's not null next time
            const { setLatestPrice } = await import("./priceEvents.js");
            setLatestPrice(live);
        }
      } catch (e) {
        logger.error({ err: e }, "Failed to fallback fetch price");
      }
    }
    
    const price = live?.price;
    if (!price || !live) {
      logger.warn("Skipping signal evaluation: no live price available");
      return;
    }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
