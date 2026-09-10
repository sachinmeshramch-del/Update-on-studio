const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

code = code.replace(
`                    if (executionResult.positionId) {
                        await safeModifyPositionSLTP({
                            positionId: String(executionResult.positionId),
                            accountId: targetAccountId,
                            orderId: String(executionResult.orderId),
                            stopLoss: formattedSL,
                            takeProfit: formattedTP,
                            intendedEntryPrice,
                            direction,
                            reason: "Streaming 2-stage post-fill SL/TP attachment"
                        });
                    }`,
`                    if (executionResult.positionId) {
                        safeModifyPositionSLTP({
                            positionId: String(executionResult.positionId),
                            accountId: targetAccountId,
                            orderId: String(executionResult.orderId),
                            stopLoss: formattedSL,
                            takeProfit: formattedTP,
                            intendedEntryPrice,
                            direction,
                            reason: "Streaming 2-stage post-fill SL/TP attachment"
                        }).catch(() => {});
                    }`
);

code = code.replace(
`                if (executionResult?.positionId) {
                    await safeModifyPositionSLTP({
                        positionId: String(executionResult.positionId),
                        accountId: targetAccountId,
                        orderId: String(executionResult.orderId),
                        stopLoss: formattedSL,
                        takeProfit: formattedTP,
                        intendedEntryPrice,
                        direction,
                        reason: "RPC 2-stage post-fill SL/TP attachment"
                    });
                }`,
`                if (executionResult?.positionId) {
                    safeModifyPositionSLTP({
                        positionId: String(executionResult.positionId),
                        accountId: targetAccountId,
                        orderId: String(executionResult.orderId),
                        stopLoss: formattedSL,
                        takeProfit: formattedTP,
                        intendedEntryPrice,
                        direction,
                        reason: "RPC 2-stage post-fill SL/TP attachment"
                    }).catch(() => {});
                }`
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
