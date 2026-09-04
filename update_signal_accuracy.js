const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/signalEngine.ts', 'utf8');

// Insert extreme RSI suppression guards right after normalization of longNorm and shortNorm
const targetNormalization = `    // Normalize to 0-100 for display and threshold comparison\n    const longNorm  = Math.min(100, Math.round((longRaw  / MAX_RAW_SCORE) * 100));\n    const shortNorm = Math.min(100, Math.round((shortRaw / MAX_RAW_SCORE) * 100));`;

const enhancedNormalization = `    // Normalize to 0-100 for display and threshold comparison\n    let longNorm  = Math.min(100, Math.round((longRaw  / MAX_RAW_SCORE) * 100));\n    let shortNorm = Math.min(100, Math.round((shortRaw / MAX_RAW_SCORE) * 100));\n\n    // ── High-Precision Accuracy Guards (Prevent buying tops / selling bottoms) ──\n    // If RSI is extremely overbought (> 78), zero out LONG score to prevent buying exhaustion tops\n    if (rsi > 78) {\n      longNorm = 0;\n      logger.info({ rsi }, "[AccuracyGuard] Extreme overbought RSI (>78) — LONG signals suppressed");\n    }\n    // If RSI is extremely oversold (< 22), zero out SHORT score to prevent selling panic bottoms\n    if (rsi < 22) {\n      shortNorm = 0;\n      logger.info({ rsi }, "[AccuracyGuard] Extreme oversold RSI (<22) — SHORT signals suppressed");\n    }\n\n    // MACD momentum expansion check: require momentum confirmation\n    if (macdBullish === false && macdHist < 0 && longNorm > 0) {\n      longNorm = Math.max(0, longNorm - 15);\n    }\n    if (macdBearish === false && macdHist > 0 && shortNorm > 0) {\n      shortNorm = Math.max(0, shortNorm - 15);\n    }`;

if (code.includes(targetNormalization)) {
  code = code.replace(targetNormalization, enhancedNormalization);
  fs.writeFileSync('./artifacts/api-server/src/lib/signalEngine.ts', code);
  console.log("Successfully updated signalEngine.ts with accuracy enhancements!");
} else {
  console.log("Target normalization block not found!");
}
