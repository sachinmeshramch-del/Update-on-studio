const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/"1m confirms"/g, '"5m confirms"');

fs.writeFileSync(file, code);
