const fs = require('fs');
const path = './artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(path, 'utf8');

// Replace the condition
code = code.replace(
  'if (finalSignal === "HOLD" && currentAdx < 25 && rangeInfo.isRanging) {',
  'if (currentAdx < 25 && rangeInfo.isRanging) {'
);

fs.writeFileSync(path, code);
console.log("Patched range condition");
