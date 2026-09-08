const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

code = code.replace(
  'newStatus   = "STOP_HIT";\\n          closedPrice = stopLoss;',
  'newStatus   = "STOP_HIT";\\n          closedPrice = currentPrice;'
);

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
