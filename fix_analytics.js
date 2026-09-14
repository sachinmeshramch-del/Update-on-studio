const fs = require('fs');
const file = 'artifacts/api-server/src/lib/performanceAnalytics.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/scalp trades/g, 'intraday trades');
code = code.replace(/scalp system/g, 'intraday system');

fs.writeFileSync(file, code);
