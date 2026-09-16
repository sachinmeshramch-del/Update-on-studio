const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const targetBlock = `      if (finalSignal !== "HOLD" && (signalType === "RANGE" || signalType === "REVERSAL")) {
        const isCounterTo1hOr15m = 
            (finalSignal === "LONG" && (macro1hState === "BEARISH" || trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND")) ||
            (finalSignal === "SHORT" && (macro1hState === "BULLISH" || trendMacro === "BULLISH" || msMacro.structure === "UPTREND"));`;

const newBlock = `      if (finalSignal !== "HOLD" && (signalType === "RANGE" || signalType === "REVERSAL")) {
        const priceBullish1h = currentPrice > lastEma20_1h && currentPrice > lastEma50_1h;
        const priceBearish1h = currentPrice < lastEma20_1h && currentPrice < lastEma50_1h;
        const isCounterTo1hOr15m = 
            (finalSignal === "LONG" && (macro1hState === "BEARISH" || trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND" || priceBearish1h)) ||
            (finalSignal === "SHORT" && (macro1hState === "BULLISH" || trendMacro === "BULLISH" || msMacro.structure === "UPTREND" || priceBullish1h));`;

code = code.replace(targetBlock, newBlock);

fs.writeFileSync(file, code);
