const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'let signalType: "TREND_FOLLOW" | "REVERSAL" | "RANGE" | "BREAKOUT" = isAgainstTrend ? "REVERSAL" : "TREND_FOLLOW";',
    'let signalType: "TREND_FOLLOW" | "REVERSAL" | "RANGE" | "BREAKOUT" = (isMarketConsolidating && rangeInfo.isRanging) ? "RANGE" : isAgainstTrend ? "REVERSAL" : "TREND_FOLLOW";'
);

fs.writeFileSync(file, content);
