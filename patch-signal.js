const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const t1 = `    const body   = Math.abs(candle.close - candle.open);
    const wick   = candle.high - candle.low;
    // Guard against doji (body ≈ 0) which would produce Infinity
    const wickRatio = body > 0.01 ? wick / body : wick > 0 ? 999 : 0;

    // Bullish sweep: wick dips below prev low, then price closes back above it
    if (candle.low < prev.low && candle.close > prev.low && wickRatio > 1.5) {
      return "BULLISH";
    }
    // Bearish sweep: wick spikes above prev high, then price closes back below it
    if (candle.high > prev.high && candle.close < prev.high && wickRatio > 1.5) {`;

const r1 = `    const body   = Math.abs(candle.close - candle.open);
    
    // Isolate wicks
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    
    // Ratios against body
    const lowerWickRatio = body > 0.01 ? lowerWick / body : lowerWick > 0 ? 999 : 0;
    const upperWickRatio = body > 0.01 ? upperWick / body : upperWick > 0 ? 999 : 0;

    // Bullish sweep: lower wick dips below prev low, price closes above it, and it's a strong bottom rejection
    if (candle.low < prev.low && candle.close > prev.low && lowerWickRatio > 1.0) {
      return "BULLISH";
    }
    // Bearish sweep: upper wick spikes above prev high, price closes below it, and it's a strong top rejection
    if (candle.high > prev.high && candle.close < prev.high && upperWickRatio > 1.0) {`;

const t2 = `    const recentMomentum     = getRecentMomentum(candles5m);
    const longMomentumAdj    = recentMomentum === "BULLISH" ? 10
                             : recentMomentum === "BEARISH" ? -15 : 0;
    const shortMomentumAdj   = recentMomentum === "BEARISH" ? 10
                             : recentMomentum === "BULLISH" ? -15 : 0;`;

const r2 = `    const recentMomentum     = getRecentMomentum(candles5m);
    const longMomentumAdj    = recentMomentum === "BULLISH" ? 10
                             : recentMomentum === "BEARISH" ? -25 : 0;
    const shortMomentumAdj   = recentMomentum === "BEARISH" ? 10
                             : recentMomentum === "BULLISH" ? -25 : 0;`;

if (code.includes(t1) && code.includes(t2)) {
    code = code.replace(t1, r1);
    code = code.replace(t2, r2);
    fs.writeFileSync(file, code);
    console.log("Patched successfully");
} else {
    console.log("Could not find targets");
}
