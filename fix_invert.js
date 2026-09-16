const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// I need to find the spot right before returning the SignalResult.
// Let's first view lines 1450-1550
