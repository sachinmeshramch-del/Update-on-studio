const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    // If it's a normal trend-following trade, ensure alignment with the 15m macro structure.
    if (finalSignal !== "HOLD" && signalType === "TREND_FOLLOW") {`;

const replace = `    // If it's a normal trend-following trade, ensure alignment with the 15m macro structure.
    if (finalSignal !== "HOLD" && signalType === "TREND_FOLLOW" && !isMarketConsolidating) {`;

content = content.replace(target, replace);
fs.writeFileSync(file, content);
