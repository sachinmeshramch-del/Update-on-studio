const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

code = code.replace(
  '        } else if (currentPrice <= stopLoss) {\\n          newStatus   = "STOP_HIT";\\n          closedPrice = stopLoss;\\n          pnlPoints   = +(closedPrice - entryPrice).toFixed(2);',
  '        } else if (currentPrice <= stopLoss) {\\n          newStatus   = "STOP_HIT";\\n          closedPrice = currentPrice;\\n          pnlPoints   = +(closedPrice - entryPrice).toFixed(2);'
);

code = code.replace(
  '        } else if (currentPrice >= stopLoss) {\\n          newStatus   = "STOP_HIT";\\n          closedPrice = stopLoss;\\n          pnlPoints   = +(entryPrice - closedPrice).toFixed(2);',
  '        } else if (currentPrice >= stopLoss) {\\n          newStatus   = "STOP_HIT";\\n          closedPrice = currentPrice;\\n          pnlPoints   = +(entryPrice - closedPrice).toFixed(2);'
);


fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
