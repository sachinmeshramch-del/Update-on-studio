const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/signalEngine.ts', 'utf8');

// Replace isAgainstTrend evaluation
code = code.replace(
  /const isAgainstTrend =[\s\S]*?let signalType: "TREND_FOLLOW" \| "REVERSAL" = "TREND_FOLLOW";[\s\S]*?if \(finalSignal !== "HOLD" && isAgainstTrend\) \{/,
  `const intendedSignal = direction !== "HOLD" ? direction : (longNorm >= shortNorm ? "LONG" : "SHORT");
    const isAgainstTrend =
      (intendedSignal === "LONG"  && effectiveTrend === "BEARISH") ||
      (intendedSignal === "SHORT" && effectiveTrend === "BULLISH");

    let signalType: "TREND_FOLLOW" | "REVERSAL" = isAgainstTrend ? "REVERSAL" : "TREND_FOLLOW";

    if (finalSignal !== "HOLD" && isAgainstTrend) {`
);

// We need to also ensure it doesn't break the original block. Let me be more precise.
