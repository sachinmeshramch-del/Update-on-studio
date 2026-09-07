const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. intendedSignal !== "HOLD" -> remove
content = content.replace('&& intendedSignal !== "HOLD"', '');

// 2. macdHistogram -> (macd.histogram || 0)
content = content.replace(/macdHistogram/g, '(macd.histogram || 0)');

// 3. sweepRej.sweptLevel <= -> sweepRej.sweptLevel !== null && sweepRej.sweptLevel <=
content = content.replace('sweepRej.sweptLevel <=', 'sweepRej.sweptLevel !== null && sweepRej.sweptLevel <=');
content = content.replace('sweepRej.sweptLevel >=', 'sweepRej.sweptLevel !== null && sweepRej.sweptLevel >=');

// 4. signalType: "TREND_FOLLOW" | "REVERSAL"
content = content.replace('let signalType: "TREND_FOLLOW" | "REVERSAL" = isAgainstTrend ? "REVERSAL" : "TREND_FOLLOW";', 'let signalType: "TREND_FOLLOW" | "REVERSAL" | "RANGE" | "BREAKOUT" = isAgainstTrend ? "REVERSAL" : "TREND_FOLLOW";');

fs.writeFileSync(file, content);
