const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

if (!code.includes('const trailingSLInFlight = new Set<string>();')) {
    code = code.replace(
        'let isEvaluating = false;',
        'let isEvaluating = false;\nconst trailingSLInFlight = new Set<string>();'
    );
}

// For LONG
code = code.replace(
`              if (matchingOpenPos) {
                const modResult = await modifyOpenPositionsStopLoss("LONG", targetSl);
                if (modResult && modResult.success && modResult.modifiedCount > 0) {
                  trade.stopLoss = targetSl;
                  await updateTradeStopLoss(id as string, targetSl);
                  logger.info(
                    { id, signal, entryPrice: actualEntry, currentPrice, currentBid, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                    "[Event-Driven Trailing SL] Successfully updated stop loss on MT5 and DB"
                  );
                } else {
                  logger.debug(
                    { id, signal, targetSl, reason: modResult?.reason },
                    "[Event-Driven Trailing SL] MT5 stop modification deferred, will retry next tick"
                  );
                }
              }`,
`              if (matchingOpenPos) {
                if (!trailingSLInFlight.has(id as string)) {
                  trailingSLInFlight.add(id as string);
                  modifyOpenPositionsStopLoss("LONG", targetSl).then(async (modResult) => {
                    if (modResult && modResult.success && modResult.modifiedCount > 0) {
                      trade.stopLoss = targetSl;
                      await updateTradeStopLoss(id as string, targetSl);
                      logger.info(
                        { id, signal, entryPrice: actualEntry, currentPrice, currentBid, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                        "[Event-Driven Trailing SL] Successfully updated stop loss on MT5 and DB"
                      );
                    } else {
                      logger.debug(
                        { id, signal, targetSl, reason: modResult?.reason },
                        "[Event-Driven Trailing SL] MT5 stop modification deferred, will retry next tick"
                      );
                    }
                  }).finally(() => trailingSLInFlight.delete(id as string));
                }
              }`
);

// For SHORT
code = code.replace(
`              if (matchingOpenPos) {
                const modResult = await modifyOpenPositionsStopLoss("SHORT", targetSl);
                if (modResult && modResult.success && modResult.modifiedCount > 0) {
                  trade.stopLoss = targetSl;
                  await updateTradeStopLoss(id as string, targetSl);
                  logger.info(
                    { id, signal, entryPrice: actualEntry, currentPrice, currentAsk, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                    "[Event-Driven Trailing SL] Successfully updated stop loss on MT5 and DB"
                  );
                } else {
                  logger.debug(
                    { id, signal, targetSl, reason: modResult?.reason },
                    "[Event-Driven Trailing SL] MT5 stop modification deferred, will retry next tick"
                  );
                }
              }`,
`              if (matchingOpenPos) {
                if (!trailingSLInFlight.has(id as string)) {
                  trailingSLInFlight.add(id as string);
                  modifyOpenPositionsStopLoss("SHORT", targetSl).then(async (modResult) => {
                    if (modResult && modResult.success && modResult.modifiedCount > 0) {
                      trade.stopLoss = targetSl;
                      await updateTradeStopLoss(id as string, targetSl);
                      logger.info(
                        { id, signal, entryPrice: actualEntry, currentPrice, currentAsk, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                        "[Event-Driven Trailing SL] Successfully updated stop loss on MT5 and DB"
                      );
                    } else {
                      logger.debug(
                        { id, signal, targetSl, reason: modResult?.reason },
                        "[Event-Driven Trailing SL] MT5 stop modification deferred, will retry next tick"
                      );
                    }
                  }).finally(() => trailingSLInFlight.delete(id as string));
                }
              }`
);

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
