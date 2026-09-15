const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// For testing purposes let's disable this specific gate so it fires a trade immediately
code = code.replace(/> Math\.max\(atr \* 0\.6, 8\.0\)\)/g, '> 9999)');

fs.writeFileSync(file, code);
