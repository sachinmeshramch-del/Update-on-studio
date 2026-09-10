const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

const search = `      if (matchingOpenPos) {
        trade.brokerPositionId = matchingOpenPos.id;
      }`;

const replace = `      if (matchingOpenPos) {
        trade.brokerPositionId = matchingOpenPos.id;
        
        // ── ZERO-LATENCY ALIGNMENT: Sync Stop Loss from Broker to DB ──
        if (matchingOpenPos.stopLoss > 0 && Math.abs(matchingOpenPos.stopLoss - stopLoss) > 0.05) {
          logger.warn(
            { id, dbSL: stopLoss, brokerSL: matchingOpenPos.stopLoss },
            "[Sync] Broker stop loss differs from DB. Syncing DB to match broker truth."
          );
          trade.stopLoss = matchingOpenPos.stopLoss;
          // Update DB (fire and forget to not block loop)
          updateTradeStopLoss(id as string, matchingOpenPos.stopLoss).catch(e => 
            logger.error({err: e}, "Failed to sync broker SL to DB")
          );
        }
      }`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
    console.log("Successfully patched tradeTracker.ts with DB sync");
} else {
    console.error("Could not find search string in tradeTracker.ts");
}
