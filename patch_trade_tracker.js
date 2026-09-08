const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

code = code.replace(
  'pnlPoints   = +(stopLoss - entryPrice).toFixed(2);',
  'pnlPoints   = +(closedPrice - entryPrice).toFixed(2);'
);

code = code.replace(
  'pnlPoints   = +(entryPrice - stopLoss).toFixed(2);',
  'pnlPoints   = +(entryPrice - closedPrice).toFixed(2);'
);

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
