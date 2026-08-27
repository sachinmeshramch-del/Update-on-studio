const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    '  calcEMA,',
    '  calcEMA,\n  detectMarketStructure,'
);

fs.writeFileSync(file, content);
console.log("Patched signalEngine.ts import");
