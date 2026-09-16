const fs = require('fs');
const fileEngine = 'artifacts/api-server/src/lib/signalEngine.ts';
let codeEngine = fs.readFileSync(fileEngine, 'utf8');

const targetEngine = `  // ── Final Result Assembly ────────────────────────────────────────────────
  const result: SignalResult = {`;
const replaceEngine = `  // ── Final Result Assembly ────────────────────────────────────────────────
  
  // Diagnostic Logging
  logger.info({
    event: "DIAGNOSTIC_BACKEND_GENERATION",
    originalSignal: direction,
    finalSignal: finalSignal,
    stopLoss: stopLoss,
    takeProfit: takeProfit,
    entryPrice: currentPrice,
    isInverseExperimentActive: EXPERIMENT_INVERT_SIGNALS
  }, "=== BACKEND SIGNAL ENGINE DIAGNOSTIC ===");

  const result: SignalResult = {`;

if (codeEngine.includes(targetEngine) && !codeEngine.includes('DIAGNOSTIC_BACKEND_GENERATION')) {
    codeEngine = codeEngine.replace(targetEngine, replaceEngine);
    fs.writeFileSync(fileEngine, codeEngine);
}
