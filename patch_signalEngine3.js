const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    if (candles5m.length > 0) candles5m[candles5m.length - 1].close = currentPrice;
    if (candles1m.length > 0) candles1m[candles1m.length - 1].close = currentPrice;
    if (candles15m.length > 0) candles15m[candles15m.length - 1].close = currentPrice;`;

const replacement = `    // Override the most recent candle's close with the real-time live price
    // Also override High/Low if the live price exceeds them
    const updateLiveCandle = (candles) => {
        if (candles.length === 0) return;
        const last = candles[candles.length - 1];
        last.close = currentPrice;
        if (currentPrice > last.high) last.high = currentPrice;
        if (currentPrice < last.low) last.low = currentPrice;
    };
    updateLiveCandle(candles5m);
    updateLiveCandle(candles1m);
    updateLiveCandle(candles15m);`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED");
} else {
  console.log("NOT FOUND");
}
