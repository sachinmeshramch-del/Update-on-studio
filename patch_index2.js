const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/index.ts', 'utf8');

const importReplace = `import { startTradeTracker } from "./lib/tradeTracker.js";
import { startDiagnosticMonitor } from "./lib/tradeMonitor.js";`;

code = code.replace(`import { startTradeTracker } from "./lib/tradeTracker.js";`, importReplace);
code = code + `\n// Start backend diagnostic monitor\nstartDiagnosticMonitor();\n`;

fs.writeFileSync('artifacts/api-server/src/index.ts', code);
console.log("Successfully patched index.ts");
