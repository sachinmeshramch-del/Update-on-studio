const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'const SPIKE_ATR_MULT       = 1.5;',
    'const SPIKE_ATR_MULT       = 2.5;'
);

fs.writeFileSync(file, content);
console.log("Patched spike guard sensitivity");
