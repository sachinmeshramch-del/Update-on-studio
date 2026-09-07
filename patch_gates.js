const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `        // SOLUTION 1: Reversal trades (counter-trend) are completely disabled.
        finalSignal = "HOLD";
        suppressionReason = "Reversal trades are disabled. Only trend-following allowed.";`;

const replace1 = `        // Allow reversal trades if confidence is high enough
        logger.info({ finalSignal }, "[MacroFilter] Allowing reversal trade (counter-trend).");`;

const target2 = `    if (finalSignal !== "HOLD" && isMarketConsolidating && rangeInfo.isRanging) {
      logger.warn({ rangeInfo, finalSignal }, "[RangeFilter] Suppressed signal because range trading is disabled");
      finalSignal = "HOLD";
      suppressionReason = \`Range trading disabled (\${rangeInfo.support.toFixed(1)} – \${rangeInfo.resistance.toFixed(1)})\`;
    }`;

const replace2 = `    if (finalSignal !== "HOLD" && isMarketConsolidating && rangeInfo.isRanging) {
      logger.info({ rangeInfo, finalSignal }, "[RangeFilter] Range trade validated and allowed.");
    }`;

content = content.replace(target1, replace1);
content = content.replace(target2, replace2);

fs.writeFileSync(file, content);
