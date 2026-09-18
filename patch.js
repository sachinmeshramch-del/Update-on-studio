const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/signalEngine.ts', 'utf8');

const targetStr = `
    // ── STRICT CHOP/SIDEWAYS FILTER ───────────────────────────────────────
    // If the market is consolidating (ADX < 25) or ranging, completely disable trading.
    
    // [DEBUG CHOP]
    logger.info({
        adx: currentAdx,
        isRanging: rangeInfo.isRanging,
        position: rangeInfo.position,
        currentPrice
    }, "[Chop Filter Status]");
    


    // ── Range Boundaries & Mid-Chop Gate ──────────────────────────────────
    // In consolidation/ranging conditions, reject trend-following breakouts in the middle of chop
    // and prevent buying into range resistance or selling into range support.
    if (finalSignal !== "HOLD" && isMarketConsolidating && rangeInfo.isRanging) {
      logger.info({ rangeInfo, finalSignal }, "[RangeFilter] Range trade validated and allowed.");
    }
`;

const replaceStr = `
    // ── STRICT CHOP/SIDEWAYS FILTER ───────────────────────────────────────
    // If the market is consolidating (ADX < 20) or ranging, completely disable trading,
    // UNLESS it is a clean range boundary bounce/breakout.
    
    // [DEBUG CHOP]
    logger.info({
        adx: currentAdx,
        isRanging: rangeInfo.isRanging,
        position: rangeInfo.position,
        currentPrice
    }, "[Chop Filter Status]");
    
    if (finalSignal !== "HOLD" && currentAdx < 20 && !rangeInfo.isRanging) {
      logger.warn({ currentAdx, finalSignal }, "[ChopFilter] Suppressing signal in pure chop (ADX < 20, no clear range).");
      finalSignal = "HOLD";
      suppressionReason = "Market is in pure chop (ADX < 20, no clean range). Waiting for momentum or boundaries.";
    }

    // ── Range Boundaries & Mid-Chop Gate ──────────────────────────────────
    // In consolidation/ranging conditions, reject trend-following breakouts in the middle of chop
    // and prevent buying into range resistance or selling into range support.
    if (finalSignal !== "HOLD" && isMarketConsolidating && rangeInfo.isRanging) {
      if (rangeInfo.position === "MID_CHOP_ZONE") {
        logger.warn({ rangeInfo, finalSignal }, "[RangeFilter] Suppressing signal in MID_CHOP_ZONE.");
        finalSignal = "HOLD";
        suppressionReason = \`Range consolidation ($\${rangeInfo.support.toFixed(1)} - $\${rangeInfo.resistance.toFixed(1)}) · Price in middle chop zone (waiting for boundary test)\`;
      } else {
        logger.info({ rangeInfo, finalSignal }, "[RangeFilter] Range trade validated and allowed at boundary.");
      }
    }
`;

const regexStr = targetStr.trim().replace(/[.*+?^$\{\}()|\[\]\\]/g, '\\$&').replace(/\\s+/g, '\\s*');
const match = code.match(new RegExp(regexStr));
if (match) {
    code = code.replace(match[0], replaceStr.trim());
    fs.writeFileSync('artifacts/api-server/src/lib/signalEngine.ts', code);
    console.log("Patched successfully!");
} else {
    console.log("Could not match target string.");
}
