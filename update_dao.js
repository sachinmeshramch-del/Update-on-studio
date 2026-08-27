const fs = require('fs');
let content = fs.readFileSync('lib/db/src/dao.ts', 'utf8');

content = content.replace(
  `autoTradingEnabled: false`,
  `autoTradingEnabled: false,\n      autoTradingDemoEnabled: false,\n      autoTradingRealEnabled: false`
);

fs.writeFileSync('lib/db/src/dao.ts', content);
