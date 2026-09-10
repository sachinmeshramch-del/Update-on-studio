const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

const searchBuffer = `const minStopBuffer = +(Math.max(currentSpread * 1.5, 1.50)).toFixed(2); // XM Safe Buffer`;
const replaceBuffer = `const minStopBuffer = +(Math.max(currentSpread * 1.2, 0.40)).toFixed(2); // Match metaApiFeed's dynamic buffer`;

if (code.includes(searchBuffer)) {
    code = code.replace(searchBuffer, replaceBuffer);
    console.log("Successfully fixed minStopBuffer in tradeTracker.ts");
} else {
    console.error("Could not find minStopBuffer in tradeTracker.ts");
}

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
