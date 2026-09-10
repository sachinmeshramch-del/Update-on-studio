const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/signalEngine.ts', 'utf8');

// Insert the Low Volatility filter inside generateSignal before finalizing the signal.
// We'll put it right after the Macro Filter block.
const searchStr = `    // ── SL / TP: Structure-Based Dynamic Stops (ATR-backed, min 1.5:1 R:R) ──`;
const replacement = `    // ── Volatility Filter (Prevent "Death by a Thousand Cuts" in Choppy/Flat Markets) ──
    if (finalSignal !== "HOLD") {
      // For XAUUSD, an ATR on 5m below 0.60 generally means a flat, lifeless market.
      // We will suppress entries to avoid being chopped up by the spread.
      const VOLATILITY_THRESHOLD = 0.60;
      if (atr < VOLATILITY_THRESHOLD) {
        logger.warn({ finalSignal, atr, threshold: VOLATILITY_THRESHOLD }, "[VolatilityFilter] Suppressed due to extremely low market volatility (Flat Market)");
        finalSignal = "HOLD";
        suppressionReason = "Filtered by Low Volatility (Flat Market / Chop Zone)";
      }
    }

    // ── SL / TP: Structure-Based Dynamic Stops (ATR-backed, min 1.5:1 R:R) ──`;

if(code.includes(searchStr)) {
    code = code.replace(searchStr, replacement);
    fs.writeFileSync('artifacts/api-server/src/lib/signalEngine.ts', code);
    console.log("Successfully added volatility filter to signalEngine.ts");
} else {
    console.error("Could not find insertion point in signalEngine.ts");
}
