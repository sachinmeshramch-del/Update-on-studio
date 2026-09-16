const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    // EXPERIMENT: INVERT SIGNALS
    const EXPERIMENT_INVERT_SIGNALS = true;
    if (EXPERIMENT_INVERT_SIGNALS && finalSignal !== "HOLD") {
        finalSignal = finalSignal === "LONG" ? "SHORT" : "LONG";
        const newStopLoss = finalSignal === "LONG" ? currentPrice - slDist : currentPrice + slDist;
        const newTakeProfit = finalSignal === "LONG" ? currentPrice + tpDist : currentPrice - tpDist;
        stopLoss = +newStopLoss.toFixed(2);
        takeProfit = +newTakeProfit.toFixed(2);
        reason = "[INVERSE EXPERIMENT] " + reason.replace(/LONG/g, "LONG_TEMP").replace(/SHORT/g, "LONG").replace(/LONG_TEMP/g, "SHORT");
    }`;

const replace = `    // EXPERIMENT: INVERT SIGNALS (SCALPING)
    const EXPERIMENT_INVERT_SIGNALS = true;
    if (EXPERIMENT_INVERT_SIGNALS && finalSignal !== "HOLD") {
        finalSignal = finalSignal === "LONG" ? "SHORT" : "LONG";
        
        // Force tight SCALPING Stop Loss and Take Profit
        slDist = Math.max(1.5, Math.min(slDist * 0.5, 3.0)); // Extremely tight SL (1.5 to 3.0 points)
        tpDist = Math.max(2.5, Math.min(tpDist * 0.4, 6.0)); // Tight scalping TP (2.5 to 6.0 points)
        
        const newStopLoss = finalSignal === "LONG" ? currentPrice - slDist : currentPrice + slDist;
        const newTakeProfit = finalSignal === "LONG" ? currentPrice + tpDist : currentPrice - tpDist;
        
        stopLoss = +newStopLoss.toFixed(2);
        takeProfit = +newTakeProfit.toFixed(2);
        reason = "[INVERSE SCALP EXPERIMENT] " + reason.replace(/LONG/g, "LONG_TEMP").replace(/SHORT/g, "LONG").replace(/LONG_TEMP/g, "SHORT");
    }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
}

// Ensure the label for tradeDuration updates
const targetDuration = `tradeDuration:        "2-8 hours",`;
const replaceDuration = `tradeDuration:        EXPERIMENT_INVERT_SIGNALS ? "15-45 mins (Scalp)" : "2-8 hours",`;
if (code.includes(targetDuration)) {
    code = code.replace(targetDuration, replaceDuration);
}

fs.writeFileSync(file, code);
