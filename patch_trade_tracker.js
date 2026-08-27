const fs = require('fs');
const file = 'artifacts/api-server/src/lib/tradeTracker.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'import { getRunningTrades, updateTradeStatus } from "@workspace/db";',
    'import { getRunningTrades, updateTradeStatus, updateTradeStopLoss } from "@workspace/db";'
);

const trailingLogic = `      if (signal === "LONG") {
        if (currentPrice >= takeProfit) {
          newStatus   = "TARGET_HIT";
          closedPrice = takeProfit;
          pnlPoints   = +(takeProfit - entryPrice).toFixed(2);
        } else if (currentPrice <= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = stopLoss;
          pnlPoints   = +(stopLoss - entryPrice).toFixed(2);
        } else {
          // Trailing SL / Break Even logic
          const distanceToTarget = takeProfit - entryPrice;
          const currentProfit = currentPrice - entryPrice;
          if (currentProfit >= distanceToTarget * 0.5 && stopLoss < entryPrice) {
            const newSl = +(entryPrice + 0.50).toFixed(2); // Break Even + small spread coverage
            await updateTradeStopLoss(id as string, newSl);
            logger.info({ id, signal, oldSl: stopLoss, newSl }, "Trailing Stop Loss moved to Break Even");
          }
        }
      } else if (signal === "SHORT") {
        if (currentPrice <= takeProfit) {
          newStatus   = "TARGET_HIT";
          closedPrice = takeProfit;
          pnlPoints   = +(entryPrice - takeProfit).toFixed(2);
        } else if (currentPrice >= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = stopLoss;
          pnlPoints   = +(entryPrice - stopLoss).toFixed(2);
        } else {
          // Trailing SL / Break Even logic
          const distanceToTarget = entryPrice - takeProfit;
          const currentProfit = entryPrice - currentPrice;
          if (currentProfit >= distanceToTarget * 0.5 && stopLoss > entryPrice) {
            const newSl = +(entryPrice - 0.50).toFixed(2); // Break Even + small spread coverage
            await updateTradeStopLoss(id as string, newSl);
            logger.info({ id, signal, oldSl: stopLoss, newSl }, "Trailing Stop Loss moved to Break Even");
          }
        }
      }`;

content = content.replace(
    /      if \(signal === "LONG"\) \{[\s\S]*?\} else if \(signal === "SHORT"\) \{[\s\S]*?\}\n/,
    trailingLogic + '\n'
);

fs.writeFileSync(file, content);
console.log("Patched tradeTracker.ts");
