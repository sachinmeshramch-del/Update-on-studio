const fs = require('fs');
let content = fs.readFileSync('lib/db/src/dao.ts', 'utf8');

content = content.replace(
  /autoTradingEnabled: false/g,
  "autoTradingDemoEnabled: false,\n      autoTradingRealEnabled: false,\n      autoTradingEnabled: false,\n      metaApiSymbol: process.env.META_API_SYMBOL || 'XAUUSD'"
);

fs.writeFileSync('lib/db/src/dao.ts', content);
