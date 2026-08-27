const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');
console.log(code.substring(code.indexOf('let finalSignal = direction;'), code.indexOf('let stopLoss:')));
