const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const oldCascade = `      const isMultiTimeframeBearish = (macro1hState === "BEARISH" || trend1h === "BEARISH" || ms1h.structure === "DOWNTREND") &&
                                      (trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND");
      const isMultiTimeframeBullish = (macro1hState === "BULLISH" || trend1h === "BULLISH" || ms1h.structure === "UPTREND") &&
                                      (trendMacro === "BULLISH" || msMacro.structure === "UPTREND");`;

const newCascade = `      const priceBullish1h = currentPrice > lastEma20_1h && currentPrice > lastEma50_1h;
      const priceBearish1h = currentPrice < lastEma20_1h && currentPrice < lastEma50_1h;

      const isMultiTimeframeBearish = (macro1hState === "BEARISH" || trend1h === "BEARISH" || ms1h.structure === "DOWNTREND" || priceBearish1h) &&
                                      (trendMacro === "BEARISH" || msMacro.structure === "DOWNTREND" || priceBearish1h);
      const isMultiTimeframeBullish = (macro1hState === "BULLISH" || trend1h === "BULLISH" || ms1h.structure === "UPTREND" || priceBullish1h) &&
                                      (trendMacro === "BULLISH" || msMacro.structure === "UPTREND" || priceBullish1h);`;

code = code.replace(oldCascade, newCascade);

const oldOverext = `      // 2. Severe EMA Distance / Overextension Protection (Falling Knife & Late Chaser Guard):
      if (finalSignal === "LONG" && (macro1hState === "BEARISH" || trend1h === "BEARISH") && (lastEma20_1h - currentPrice) > Math.max(atr * 0.8, 10.0)) {`;

const newOverext = `      // 2. Severe EMA Distance / Overextension Protection (Falling Knife & Late Chaser Guard):
      if (finalSignal === "LONG" && (macro1hState === "BEARISH" || trend1h === "BEARISH" || priceBearish1h) && (lastEma20_1h - currentPrice) > Math.max(atr * 0.8, 10.0)) {`;

code = code.replace(oldOverext, newOverext);

const oldOverextShort = `      } else if (finalSignal === "SHORT" && (macro1hState === "BULLISH" || trend1h === "BULLISH") && (currentPrice - lastEma20_1h) > Math.max(atr * 0.8, 10.0)) {`;
const newOverextShort = `      } else if (finalSignal === "SHORT" && (macro1hState === "BULLISH" || trend1h === "BULLISH" || priceBullish1h) && (currentPrice - lastEma20_1h) > Math.max(atr * 0.8, 10.0)) {`;

code = code.replace(oldOverextShort, newOverextShort);

fs.writeFileSync(file, code);
