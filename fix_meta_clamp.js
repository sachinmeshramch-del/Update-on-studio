const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

// LONG clamp
code = code.replace(
`        if (targetSL > 0 && currentBid !== undefined) {
            const maxAllowedSL = Number((currentBid - minStopBuffer).toFixed(digits));
            if (targetSL > maxAllowedSL) {
                logger.info(
                    { positionId, targetSL, maxAllowedSL, currentBid, minStopBuffer, reason },
                    "[Verify-before-Update] Target SL exceeds broker maximum allowed SL for LONG (too close to live Bid); deferring modification to prevent MT5 10016 invalid stops"
                );
                return { success: false, reason: "PRICE_TOO_CLOSE_TO_STOP" };
            }
        }`,
`        if (targetSL > 0 && currentBid !== undefined) {
            const maxAllowedSL = Number((currentBid - minStopBuffer).toFixed(digits));
            if (targetSL > maxAllowedSL) {
                logger.info(
                    { positionId, targetSL, maxAllowedSL, currentBid, minStopBuffer, reason },
                    "[Verify-before-Update] Target SL exceeds broker maximum allowed SL for LONG. Clamping to maxAllowedSL to ensure MT5 acceptance."
                );
                targetSL = maxAllowedSL;
                if (pos && targetSL <= pos.stopLoss) {
                    return { success: false, reason: "PRICE_TOO_CLOSE_TO_STOP" };
                }
            }
        }`
);

// SHORT clamp
code = code.replace(
`        if (targetSL > 0 && currentAsk !== undefined) {
            const minAllowedSL = Number((currentAsk + minStopBuffer).toFixed(digits));
            if (targetSL < minAllowedSL) {
                logger.info(
                    { positionId, targetSL, minAllowedSL, currentAsk, minStopBuffer, reason },
                    "[Verify-before-Update] Target SL is below broker minimum allowed SL for SHORT (too close to live Ask); deferring modification to prevent MT5 10016 invalid stops"
                );
                return { success: false, reason: "PRICE_TOO_CLOSE_TO_STOP" };
            }
        }`,
`        if (targetSL > 0 && currentAsk !== undefined) {
            const minAllowedSL = Number((currentAsk + minStopBuffer).toFixed(digits));
            if (targetSL < minAllowedSL) {
                logger.info(
                    { positionId, targetSL, minAllowedSL, currentAsk, minStopBuffer, reason },
                    "[Verify-before-Update] Target SL is below broker minimum allowed SL for SHORT. Clamping to minAllowedSL to ensure MT5 acceptance."
                );
                targetSL = minAllowedSL;
                if (pos && targetSL >= pos.stopLoss && pos.stopLoss > 0) {
                    return { success: false, reason: "PRICE_TOO_CLOSE_TO_STOP" };
                }
            }
        }`
);

// Expose calibratedSL in modifyOpenPositionsStopLoss
code = code.replace(
`export async function modifyOpenPositionsStopLoss(
    direction: "LONG" | "SHORT",
    newStopLoss: number
): Promise<{ success: boolean; modifiedCount: number; reason?: string }> {`,
`export async function modifyOpenPositionsStopLoss(
    direction: "LONG" | "SHORT",
    newStopLoss: number
): Promise<{ success: boolean; modifiedCount: number; reason?: string; calibratedSL?: number }> {`
);

code = code.replace(
`        let modifiedCount = 0;
        let lastFailureReason: string | undefined;

        for (const pos of matchingPositions) {`,
`        let modifiedCount = 0;
        let lastFailureReason: string | undefined;
        let finalCalibratedSL = newStopLoss;

        for (const pos of matchingPositions) {`
);

code = code.replace(
`            if (result.success) {
                modifiedCount++;
            } else {`,
`            if (result.success) {
                modifiedCount++;
                if (result.calibratedSL) finalCalibratedSL = result.calibratedSL;
            } else {`
);

code = code.replace(
`        return {
            success: modifiedCount > 0,
            modifiedCount,
            reason: modifiedCount > 0 ? "SUCCESS" : (lastFailureReason || "MODIFICATION_DEFERRED")
        };`,
`        return {
            success: modifiedCount > 0,
            modifiedCount,
            reason: modifiedCount > 0 ? "SUCCESS" : (lastFailureReason || "MODIFICATION_DEFERRED"),
            calibratedSL: finalCalibratedSL
        };`
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
