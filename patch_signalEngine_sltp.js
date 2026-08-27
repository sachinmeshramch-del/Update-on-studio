const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const oldLogic = `    // ── SL / TP (ATR-based, minimum 1.5:1 R:R enforced) ──────────────────
    // Previous regime had SL up to 22 pts and TP capped at 9 pts → 0.41:1 R:R,
    // meaning you needed 71%+ win rate just to break even. Now:
    //   SL = 1.5×ATR (trend-follow) or 2×ATR (reversal), capped at 14
    //   TP = slDist × dynamically scaled based on ADX (up to 3x)
    const slMultiplier = signalType === "REVERSAL" ? 2.0 : 1.5;
    const slDist = Math.min(Math.max(atr * slMultiplier, 5), 14);
    
    // If trend is very strong (ADX > 25), stretch TP to catch runners
    const rrMultiplier = currentAdx > 25 ? 2.5 : 1.5;
    const tpDist = slDist * rrMultiplier;

    let stopLoss:   number;
    let takeProfit: number;

    if (finalSignal === "LONG") {
      stopLoss   = +(currentPrice - slDist).toFixed(2);
      takeProfit = +(currentPrice + tpDist).toFixed(2);
    } else if (finalSignal === "SHORT") {
      stopLoss   = +(currentPrice + slDist).toFixed(2);
      takeProfit = +(currentPrice - tpDist).toFixed(2);
    } else {
      stopLoss   = +(currentPrice - slDist).toFixed(2);
      takeProfit = +(currentPrice + tpDist).toFixed(2);
    }`;

const newLogic = `    // ── SL / TP (Market Structure + ATR-based) ───────────────────────────
    const ms = detectMarketStructure(candles5m);
    
    const slMultiplier = signalType === "REVERSAL" ? 2.0 : 1.5;
    const atrSlDist = Math.min(Math.max(atr * slMultiplier, 5), 14);
    const rrMultiplier = currentAdx > 25 ? 2.5 : 1.5;

    let stopLoss:   number;
    let takeProfit: number;

    if (finalSignal === "LONG") {
      // SL below recent swing low (if valid), otherwise fallback to ATR
      const recentLow = ms.lastLL || ms.lastHL || (currentPrice - atrSlDist);
      let structSlDist = currentPrice - recentLow + 0.5; // +0.5 buffer
      
      // Clamp structure distance to safe min/max
      structSlDist = Math.min(Math.max(structSlDist, 5), 18);
      
      stopLoss = +(currentPrice - structSlDist).toFixed(2);
      takeProfit = +(currentPrice + (structSlDist * rrMultiplier)).toFixed(2);
    } else if (finalSignal === "SHORT") {
      // SL above recent swing high (if valid), otherwise fallback to ATR
      const recentHigh = ms.lastHH || ms.lastLH || (currentPrice + atrSlDist);
      let structSlDist = recentHigh - currentPrice + 0.5; // +0.5 buffer
      
      // Clamp structure distance to safe min/max
      structSlDist = Math.min(Math.max(structSlDist, 5), 18);
      
      stopLoss = +(currentPrice + structSlDist).toFixed(2);
      takeProfit = +(currentPrice - (structSlDist * rrMultiplier)).toFixed(2);
    } else {
      stopLoss   = +(currentPrice - atrSlDist).toFixed(2);
      takeProfit = +(currentPrice + (atrSlDist * rrMultiplier)).toFixed(2);
    }`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync(file, content);
console.log("Patched SL/TP logic");
