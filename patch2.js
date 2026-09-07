const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/signalScheduler.ts', 'utf8');

const oldCheck = `    const live  = getLatestPrice();
    const price = live?.price;
    if (!price) {
      logger.warn("Skipping signal evaluation: no live price available");
      return;
    }`;

const newCheck = `    const live  = getLatestPrice();
    const price = live?.price;
    if (!price || !live) {
      logger.warn("Skipping signal evaluation: no live price available");
      return;
    }

    // ── Feed Staleness & Market Closure Guard ──
    // If the broker stops sending quotes (e.g. daily break, weekend, or holiday like Labor Day),
    // the live feed will go stale. We pause signals to prevent the bot from hallucinating on old data.
    const msSinceLastPrice = Date.now() - live.ms;
    if (msSinceLastPrice > 5 * 60 * 1000) {
        // Log once every 5 minutes to avoid spam
        if (Date.now() % (5 * 60 * 1000) < 5000) {
            logger.warn({ msSinceLastPrice }, "Skipping signal evaluation: Price feed is stale (market likely closed for holiday or daily break)");
        }
        return;
    }`;

code = code.replace(oldCheck, newCheck);
fs.writeFileSync('artifacts/api-server/src/lib/signalScheduler.ts', code);
