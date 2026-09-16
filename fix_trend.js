const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const targetBlock = `      // 3. Strict blocking for Trend-Following Trades: Never trend-follow against 1H macro or 15m structure
      if (finalSignal !== "HOLD" && signalType === "TREND_FOLLOW") {
        if (finalSignal === "LONG" && (macro1hState === "BEARISH" || trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND")) {`;

const newBlock = `      // 3. Strict blocking for Trend-Following Trades: Never trend-follow against 1H macro or 15m structure
      if (finalSignal !== "HOLD" && signalType === "TREND_FOLLOW") {
        const priceBullish1h = currentPrice > lastEma20_1h && currentPrice > lastEma50_1h;
        const priceBearish1h = currentPrice < lastEma20_1h && currentPrice < lastEma50_1h;
        
        if (finalSignal === "LONG" && (macro1hState === "BEARISH" || trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND" || priceBearish1h)) {`;

code = code.replace(targetBlock, newBlock);

const targetBlock2 = `        } else if (finalSignal === "SHORT" && (macro1hState === "BULLISH" || trendMacro === "BULLISH" || msMacro.structure === "UPTREND")) {`;

const newBlock2 = `        } else if (finalSignal === "SHORT" && (macro1hState === "BULLISH" || trendMacro === "BULLISH" || msMacro.structure === "UPTREND" || priceBullish1h)) {`;

code = code.replace(targetBlock2, newBlock2);

fs.writeFileSync(file, code);
