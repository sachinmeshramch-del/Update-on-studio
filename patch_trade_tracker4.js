const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

// For LONG stop loss
code = code.replace(
  /newStatus\\s*=\\s*"STOP_HIT";\\s*closedPrice\\s*=\\s*stopLoss;/g,
  'newStatus   = "STOP_HIT";\\n          closedPrice = currentPrice;'
);

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
