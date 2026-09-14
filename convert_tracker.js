const fs = require('fs');
const file = 'artifacts/api-server/src/lib/tradeTracker.ts';
let code = fs.readFileSync(file, 'utf8');

// For intraday, we need much wider trailing parameters.
// Old Tier 1: if (peakProfit >= 5 && peakProfit < 9) newStopLoss = currentPrice +/- 3.5
// Old Tier 2: if (peakProfit >= 9 && peakProfit < 15) newStopLoss = currentPrice +/- 4.5
// Old Tier 3: if (peakProfit >= 15) newStopLoss = currentPrice +/- 5.5

// Let's replace the fixed numbers in tradeTracker.ts
code = code.replace(/if \(peakProfit >= 5 && peakProfit < 9\) \{\n\s+trailDistance = 3\.5;/g, "if (peakProfit >= 10 && peakProfit < 20) {\n                  trailDistance = 6.0;");
code = code.replace(/Tier 1 Runner \(\+5 to \+9 pts\): Trail 3\.5 pts behind peak price/g, 'Tier 1 Runner (+10 to +20 pts): Trail 6.0 pts behind peak price');

code = code.replace(/if \(peakProfit >= 9 && peakProfit < 15\) \{\n\s+trailDistance = 4\.5;/g, "if (peakProfit >= 20 && peakProfit < 35) {\n                  trailDistance = 9.0;");
code = code.replace(/Tier 2 Strong Runner \(\+9 to \+15 pts\): Trail 4\.5 pts behind peak price/g, 'Tier 2 Strong Runner (+20 to +35 pts): Trail 9.0 pts behind peak price');

code = code.replace(/if \(peakProfit >= 15\) \{\n\s+trailDistance = 5\.5;/g, "if (peakProfit >= 35) {\n                  trailDistance = 15.0;");
code = code.replace(/Tier 3 Mega Runner \(> \+15 pts\): Trail 5\.5 pts behind peak price/g, 'Tier 3 Mega Runner (> +35 pts): Trail 15.0 pts behind peak price');

// The same block happens twice (LONG and SHORT) - replace globally using broader Regex
code = code.replace(/peakProfit >= 5 && peakProfit < 9/g, 'peakProfit >= 10 && peakProfit < 20');
code = code.replace(/trailDistance = 3\.5;/g, 'trailDistance = 6.0;');

code = code.replace(/peakProfit >= 9 && peakProfit < 15/g, 'peakProfit >= 20 && peakProfit < 35');
code = code.replace(/trailDistance = 4\.5;/g, 'trailDistance = 9.0;');

code = code.replace(/peakProfit >= 15/g, 'peakProfit >= 35');
code = code.replace(/trailDistance = 5\.5;/g, 'trailDistance = 15.0;');

// Break even step:
code = code.replace(/if \(peakProfit >= 3\.5\) \{/g, 'if (peakProfit >= 6.0) {');
code = code.replace(/if \(peakProfit >= 3\.0\) \{/g, 'if (peakProfit >= 5.0) {');

fs.writeFileSync(file, code);
console.log("Converted tradeTracker.ts trailing stops for intraday.");
