const fs = require('fs');
let code = fs.readFileSync('artifacts/gold-swing-ai/src/pages/backtest.tsx', 'utf8');

code = code.replace(/\\\$/g, '$');

fs.writeFileSync('artifacts/gold-swing-ai/src/pages/backtest.tsx', code);
