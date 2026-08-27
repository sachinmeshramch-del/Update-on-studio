const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    const closes5m = candles5m.map(c => c.close);
    const closes1m = candles1m.map(c => c.close);
    const closes15m = candles15m.map(c => c.close);`;

const replacement = `    // Override the most recent candle's close with the real-time live price
    // This allows us to cache MetaApi historical requests for longer without losing live precision
    if (candles5m.length > 0) candles5m[candles5m.length - 1].close = currentPrice;
    if (candles1m.length > 0) candles1m[candles1m.length - 1].close = currentPrice;
    if (candles15m.length > 0) candles15m[candles15m.length - 1].close = currentPrice;

    const closes5m = candles5m.map(c => c.close);
    const closes1m = candles1m.map(c => c.close);
    const closes15m = candles15m.map(c => c.close);`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED SIGNAL ENGINE");
} else {
  console.log("NOT FOUND TARGET");
}
