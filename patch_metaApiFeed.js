const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

const searchFn = `export async function modifyOpenPositionsStopLoss(
    direction: "LONG" | "SHORT",
    newStopLoss: number
): Promise<{ success: boolean; modifiedCount: number; reason?: string; calibratedSL?: number }> {
    if (!token) return { success: false, modifiedCount: 0, reason: "NO_TOKEN" };
    try {
        const positions = await getOpenBrokerPositions();
        const matchingPositions = positions.filter(pos => pos.type === direction);
        if (matchingPositions.length === 0) {
            return { success: true, modifiedCount: 0, reason: "NO_MATCHING_POSITIONS" };
        }

        let modifiedCount = 0;
        let lastFailureReason: string | undefined;
        let finalCalibratedSL = newStopLoss;

        for (const pos of matchingPositions) {
            // If position is already in a closure sequence or deal completed, skip immediately
            if (isPositionInClosureSequence(pos.id)) {
                logger.debug({ positionId: pos.id }, "[Trailing SL] Skipping position in closure sequence");
                continue;
            }
            if (pos.stopLoss > 0 && Math.abs(pos.stopLoss - newStopLoss) < 0.05) {
                modifiedCount++;
                continue;
            }

            // Execute safe modify using the asynchronous Verify-before-Update loop
            const result = await safeModifyPositionSLTP({
                positionId: pos.id,
                accountId: pos.accountId,
                stopLoss: newStopLoss,
                takeProfit: pos.takeProfit,
                direction,
                reason: \`Dynamic trailing stop loss update to \${newStopLoss}\`
            });

            if (result.success) {
                modifiedCount++;
                if (result.calibratedSL) finalCalibratedSL = result.calibratedSL;
            } else {
                lastFailureReason = result.reason;
            }
        }
        return {
            success: modifiedCount > 0,
            modifiedCount,
            reason: modifiedCount > 0 ? "SUCCESS" : (lastFailureReason || "MODIFICATION_DEFERRED"),
            calibratedSL: finalCalibratedSL
        };`;

const replaceFn = `export async function modifyOpenPositionsStopLoss(
    direction: "LONG" | "SHORT",
    newStopLoss: number,
    maxRetries = 3
): Promise<{ success: boolean; modifiedCount: number; reason?: string; calibratedSL?: number }> {
    if (!token) return { success: false, modifiedCount: 0, reason: "NO_TOKEN" };
    try {
        const positions = await getOpenBrokerPositions();
        const matchingPositions = positions.filter(pos => pos.type === direction);
        if (matchingPositions.length === 0) {
            return { success: true, modifiedCount: 0, reason: "NO_MATCHING_POSITIONS" };
        }

        let modifiedCount = 0;
        let lastFailureReason: string | undefined;
        let finalCalibratedSL = newStopLoss;

        for (const pos of matchingPositions) {
            if (isPositionInClosureSequence(pos.id)) {
                logger.debug({ positionId: pos.id }, "[Trailing SL] Skipping position in closure sequence");
                continue;
            }
            if (pos.stopLoss > 0 && Math.abs(pos.stopLoss - newStopLoss) < 0.05) {
                modifiedCount++;
                continue;
            }

            let attempt = 1;
            let success = false;
            
            while (attempt <= maxRetries && !success) {
                const result = await safeModifyPositionSLTP({
                    positionId: pos.id,
                    accountId: pos.accountId,
                    stopLoss: newStopLoss,
                    takeProfit: pos.takeProfit,
                    direction,
                    reason: \`Dynamic trailing SL update to \${newStopLoss} (Attempt \${attempt}/\${maxRetries})\`
                });

                if (result.success) {
                    success = true;
                    modifiedCount++;
                    if (result.calibratedSL) finalCalibratedSL = result.calibratedSL;
                } else {
                    lastFailureReason = result.reason;
                    // Do not retry if the broker reported it's already closed or if the price is invalid
                    if (result.reason === "POSITION_CLOSED_BY_BROKER" || result.reason === "ALREADY_MATCHED") {
                        break;
                    }
                    
                    if (attempt < maxRetries) {
                        logger.warn({ positionId: pos.id, attempt, reason: result.reason }, \`[Trailing SL Retry] Update failed, retrying in \${attempt * 600}ms...\`);
                        await new Promise(r => setTimeout(r, attempt * 600));
                    }
                }
                attempt++;
            }
        }
        return {
            success: modifiedCount > 0,
            modifiedCount,
            reason: modifiedCount > 0 ? "SUCCESS" : (lastFailureReason || "MODIFICATION_DEFERRED"),
            calibratedSL: finalCalibratedSL
        };`;

if (code.includes(searchFn)) {
    code = code.replace(searchFn, replaceFn);
    fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
    console.log("Successfully patched metaApiFeed.ts with retry mechanism");
} else {
    console.error("Could not find modifyOpenPositionsStopLoss in metaApiFeed.ts");
}
