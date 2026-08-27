const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const oldLogic = `
    let signalType: "TREND_FOLLOW" | "REVERSAL" = "TREND_FOLLOW";

    // ── Macro Trend Filter (15m) ────────────────────────────────────────
    if (finalSignal !== "HOLD" && trend15m !== "NEUTRAL") {
      if ((finalSignal === "LONG" && trend15m === "BEARISH") || 
          (finalSignal === "SHORT" && trend15m === "BULLISH")) {
         logger.warn({ finalSignal, trend15m }, "Signal suppressed by 15m macro trend");
         finalSignal = "HOLD"; // Suppress signals fighting the 15m macro trend
         suppressionReason = "Filtered by 15m macro trend";
      }
    }

    if (finalSignal !== "HOLD" && isAgainstTrend) {
      const chochConfirms = choch.detected    && choch.direction    === (finalSignal === "LONG" ? "BULLISH" : "BEARISH");
      const sweepConfirms = sweepRej.detected && sweepRej.rejectionType === (finalSignal === "LONG" ? "BULLISH" : "BEARISH");
      const hasConfirmation = chochConfirms || sweepConfirms;

      if (!hasConfirmation || confidence < MIN_CONF_REVERSAL) {
        // Insufficient structural evidence for counter-trend trade → stay out
        finalSignal = "HOLD";
        suppressionReason = "Counter-trend trade requires 75% confidence";
      } else {
        signalType = "REVERSAL";
      }
    }
`;

const newLogic = `
    let signalType: "TREND_FOLLOW" | "REVERSAL" = "TREND_FOLLOW";

    // ── Reversal Classification & Gate ────────────────────────────────────
    if (finalSignal !== "HOLD" && isAgainstTrend) {
      const chochConfirms = choch.detected    && choch.direction    === (finalSignal === "LONG" ? "BULLISH" : "BEARISH");
      const sweepConfirms = sweepRej.detected && sweepRej.rejectionType === (finalSignal === "LONG" ? "BULLISH" : "BEARISH");
      const hasConfirmation = chochConfirms || sweepConfirms;

      if (!hasConfirmation || confidence < MIN_CONF_REVERSAL) {
        // Insufficient structural evidence for counter-trend trade → stay out
        finalSignal = "HOLD";
        suppressionReason = "Counter-trend trade requires 75% confidence";
      } else {
        signalType = "REVERSAL";
      }
    }

    // ── Macro Trend Filter (15m) ────────────────────────────────────────
    // If it's a normal trend-following trade, make sure it aligns with the 15m macro trend.
    // If it's a high-confidence valid structural REVERSAL (passed the gate above), allow it to fight the macro trend.
    if (finalSignal !== "HOLD" && signalType === "TREND_FOLLOW" && trend15m !== "NEUTRAL") {
      if ((finalSignal === "LONG" && trend15m === "BEARISH") || 
          (finalSignal === "SHORT" && trend15m === "BULLISH")) {
         logger.warn({ finalSignal, trend15m }, "Signal suppressed by 15m macro trend");
         finalSignal = "HOLD"; // Suppress signals fighting the 15m macro trend
         suppressionReason = "Filtered by 15m macro trend";
      }
    }
`;

if (content.includes(oldLogic.trim())) {
  content = content.replace(oldLogic.trim(), newLogic.trim());
  fs.writeFileSync(file, content);
  console.log("Patched successfully");
} else {
  console.log("Could not find the old logic string. Maybe it has different whitespace?");
}
