const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

code = code.replace(
`                  modifyOpenPositionsStopLoss("LONG", targetSl).then(async (modResult) => {
                    if (modResult && modResult.success && modResult.modifiedCount > 0) {
                      trade.stopLoss = targetSl;
                      await updateTradeStopLoss(id as string, targetSl);`,
`                  modifyOpenPositionsStopLoss("LONG", targetSl).then(async (modResult) => {
                    if (modResult && modResult.success && modResult.modifiedCount > 0) {
                      const actualSavedSl = modResult.calibratedSL || targetSl;
                      trade.stopLoss = actualSavedSl;
                      await updateTradeStopLoss(id as string, actualSavedSl);`
);

code = code.replace(
`                        { id, signal, entryPrice: actualEntry, currentPrice, currentBid, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },`,
`                        { id, signal, entryPrice: actualEntry, currentPrice, currentBid, oldSl: stopLoss, newSl: actualSavedSl, distanceToTarget, currentProfit },`
);

code = code.replace(
`                  modifyOpenPositionsStopLoss("SHORT", targetSl).then(async (modResult) => {
                    if (modResult && modResult.success && modResult.modifiedCount > 0) {
                      trade.stopLoss = targetSl;
                      await updateTradeStopLoss(id as string, targetSl);`,
`                  modifyOpenPositionsStopLoss("SHORT", targetSl).then(async (modResult) => {
                    if (modResult && modResult.success && modResult.modifiedCount > 0) {
                      const actualSavedSl = modResult.calibratedSL || targetSl;
                      trade.stopLoss = actualSavedSl;
                      await updateTradeStopLoss(id as string, actualSavedSl);`
);

code = code.replace(
`                        { id, signal, entryPrice: actualEntry, currentPrice, currentAsk, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },`,
`                        { id, signal, entryPrice: actualEntry, currentPrice, currentAsk, oldSl: stopLoss, newSl: actualSavedSl, distanceToTarget, currentProfit },`
);

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
