const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// Restore the proper ATR math for the late-to-the-party gate
code = code.replace(/> 9999\)/g, '> Math.max(atr * 0.6, 8.0))');

fs.writeFileSync(file, code);
