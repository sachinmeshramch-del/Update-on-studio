const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Rename variables
code = code.replace(/candles5m/g, 'candlesPrimary');
code = code.replace(/candles1m/g, 'candlesEntry');
code = code.replace(/candles15m/g, 'candlesMacro');
code = code.replace(/candles1h/g, 'candlesHTF');

code = code.replace(/cachedCandles5m/g, 'cachedCandlesPrimary');
code = code.replace(/cachedCandles1m/g, 'cachedCandlesEntry');
code = code.replace(/cachedCandles15m/g, 'cachedCandlesMacro');
code = code.replace(/cachedCandles1h/g, 'cachedCandlesHTF');

code = code.replace(/trend5m/g, 'trendPrimary');
code = code.replace(/trend1m/g, 'trendEntry');
code = code.replace(/trend15m/g, 'trendMacro');
code = code.replace(/ms15m/g, 'msMacro');

code = code.replace(/CANDLE_5M_MS/g, 'CANDLE_PRIMARY_MS');
code = code.replace(/300_000; \/\/ 5 min in ms/g, '900_000; // 15 min in ms');
code = code.replace(/300000\)/g, '900000)');

// 2. Adjust Timeframes fetched
code = code.replace(/fetchWithFallback\("5m"/g, 'fetchWithFallback("15m"');
code = code.replace(/fetchWithFallback\("1m"/g, 'fetchWithFallback("5m"');
code = code.replace(/fetchWithFallback\("15m"/g, 'fetchWithFallback("1h"');
code = code.replace(/fetchWithFallback\("1h"/g, 'fetchWithFallback("4h"');

// Adjust fallback synthesized logic
// 15m from 5m (now 1h from 15m) -> 1h has 4x 15m candles
code = code.replace(/i \+= 3/g, 'i += 4');
code = code.replace(/i \+ 3/g, 'i + 4');

// 1h from 5m (now 4h from 15m) -> 4h has 16x 15m candles
code = code.replace(/i \+= 12/g, 'i += 16');
code = code.replace(/i \+ 12/g, 'i + 16');

// 3. Constants
code = code.replace(/COOLDOWN_MS\s*=\s*900_000;\s*\/\/\s*15 minutes/g, 'COOLDOWN_MS             = 7_200_000;  // 2 hours');
code = code.replace(/MIN_SIGNAL_INTERVAL_MS\s*=\s*5 \* 60_000;/g, 'MIN_SIGNAL_INTERVAL_MS  = 30 * 60_000;');
code = code.replace(/MIN_PRICE_MOVE_PCT\s*=\s*0.002;/g, 'MIN_PRICE_MOVE_PCT      = 0.004;');
code = code.replace(/tradeDuration: "5-30 minutes"/g, 'tradeDuration: "2-8 hours"');
code = code.replace(/tradeDuration:\s*"5-30 minutes"/g, 'tradeDuration:        "2-8 hours"');
code = code.replace(/Scalping constants/g, 'Intraday constants');

// 4. SL / TP Distance Adjustments
// Old SL cap: slDist = Math.min(Math.max(structuralDist, minAtrPadding, 2.0), 3.5);
// New SL cap: Intraday needs 4.0 to 12.0
code = code.replace(/Math\.min\(Math\.max\(structuralDist, minAtrPadding, 2\.0\), 3\.5\)/g, 'Math.min(Math.max(structuralDist, minAtrPadding, 4.0), 12.0)');
// Old flat SL cap: Math.min(Math.max(minAtrPadding, 2.5), 8.0);
code = code.replace(/Math\.min\(Math\.max\(minAtrPadding, 2\.5\), 8\.0\)/g, 'Math.min(Math.max(minAtrPadding, 5.0), 15.0)');

// For RANGE trades, SL: Math.min(Math.max(atr * 1.0, 2.0), 6.0)
code = code.replace(/Math\.min\(Math\.max\(atr \* 1\.0, 2\.0\), 6\.0\)/g, 'Math.min(Math.max(atr * 1.5, 4.0), 10.0)');

// Range TP: Math.max((rangeInfo.resistance - currentPrice) * 0.8, 2.5) -> ... 5.0
code = code.replace(/\* 0\.8, 2\.5\)/g, '* 0.8, 5.0)');

// Reward to Risk Multiplier for Intraday: capture larger swings
// Old: const rrMultiplier = signalType === "REVERSAL" ? 1.0 : currentAdx > 25 ? 1.5 : 1.2;
// New: const rrMultiplier = signalType === "REVERSAL" ? 1.5 : currentAdx > 25 ? 2.5 : 1.8;
code = code.replace(/signalType === "REVERSAL" \? 1\.0 : currentAdx > 25 \? 1\.5 : 1\.2/g, 'signalType === "REVERSAL" ? 1.5 : currentAdx > 25 ? 2.5 : 1.8');

fs.writeFileSync(file, code);
console.log("Converted signalEngine.ts for intraday trading.");
