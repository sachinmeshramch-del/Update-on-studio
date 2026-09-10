const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/index.ts', 'utf8');

const importSearch = `import { startTradeTracker } from "./lib/tradeTracker.js";`;
const importReplace = `import { startTradeTracker } from "./lib/tradeTracker.js";
import { startDiagnosticMonitor } from "./lib/tradeMonitor.js";`;

const startSearch = `  startTradeTracker();
  logger.info("Trade tracking and sync service started.");`;
const startReplace = `  startTradeTracker();
  logger.info("Trade tracking and sync service started.");
  
  // Start diagnostic monitor for debugging trailing stops
  startDiagnosticMonitor();
  logger.info("Diagnostic monitor service started.");`;

if (code.includes(importSearch) && code.includes(startSearch)) {
    code = code.replace(importSearch, importReplace);
    code = code.replace(startSearch, startReplace);
    fs.writeFileSync('artifacts/api-server/src/index.ts', code);
    console.log("Successfully patched index.ts to start diagnostic monitor");
} else {
    console.error("Could not find insertion points in index.ts");
}
