const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/signalEngine.ts', 'utf8');

// Replace the RR block and slDist boundaries
code = code.replace(
  'slDist = Math.min(Math.max(structuralDist, minAtrPadding, 5.0), 16.0);',
  'slDist = Math.min(Math.max(structuralDist, minAtrPadding, 2.5), 8.0);'
);
code = code.replace(
  'slDist = Math.min(Math.max(structuralDist, minAtrPadding, 5.0), 16.0);',
  'slDist = Math.min(Math.max(structuralDist, minAtrPadding, 2.5), 8.0);'
);
code = code.replace(
  'slDist = Math.min(Math.max(minAtrPadding, 5.0), 16.0);',
  'slDist = Math.min(Math.max(minAtrPadding, 2.5), 8.0);'
);

code = code.replace(
  'const rrMultiplier = signalType === "REVERSAL" ? 1.5 : currentAdx > 25 ? 2.5 : 2.0;',
  '// Dynamically scaled RR for scalping (much tighter targets to ensure high win rate)\n    const rrMultiplier = signalType === "REVERSAL" ? 1.0 : currentAdx > 25 ? 1.5 : 1.2;'
);

code = code.replace(
  'const targetDist = calcDir === "LONG" \n        ? Math.max((rangeInfo.resistance - currentPrice) * 0.9, 4.0) \n        : Math.max((currentPrice - rangeInfo.support) * 0.9, 4.0);',
  'const targetDist = calcDir === "LONG" \n        ? Math.max((rangeInfo.resistance - currentPrice) * 0.8, 2.5) \n        : Math.max((currentPrice - rangeInfo.support) * 0.8, 2.5);'
);

// Decrease the range stop loss minimum too
code = code.replace(
  'slDist = Math.min(Math.max(atr * 1.2, 3.0), 10.0);',
  'slDist = Math.min(Math.max(atr * 1.0, 2.0), 6.0);'
);

fs.writeFileSync('artifacts/api-server/src/lib/signalEngine.ts', code);
