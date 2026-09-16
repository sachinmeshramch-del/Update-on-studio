const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const target1 = `    if (finalSignal !== "HOLD" && isCommit) {`;
const replace1 = `    // EXPERIMENT: INVERT SIGNALS
    const EXPERIMENT_INVERT_SIGNALS = true;
    if (EXPERIMENT_INVERT_SIGNALS && finalSignal !== "HOLD") {
        finalSignal = finalSignal === "LONG" ? "SHORT" : "LONG";
        const newStopLoss = finalSignal === "LONG" ? currentPrice - slDist : currentPrice + slDist;
        const newTakeProfit = finalSignal === "LONG" ? currentPrice + tpDist : currentPrice - tpDist;
        stopLoss = +newStopLoss.toFixed(2);
        takeProfit = +newTakeProfit.toFixed(2);
        reason = "[INVERSE EXPERIMENT] " + reason.replace(/LONG/g, "LONG_TEMP").replace(/SHORT/g, "LONG").replace(/LONG_TEMP/g, "SHORT");
    }

    if (finalSignal !== "HOLD" && isCommit) {`;

code = code.replace(target1, replace1);

fs.writeFileSync(file, code);
