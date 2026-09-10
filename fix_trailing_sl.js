const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

code = code.replace(
`const minStopBuffer = +(Math.max(currentSpread * 1.2, 0.45)).toFixed(2);`,
`const minStopBuffer = +(Math.max(currentSpread * 1.5, 1.50)).toFixed(2); // XM Safe Buffer`
);

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
