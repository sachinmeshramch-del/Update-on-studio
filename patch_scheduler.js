const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let content = fs.readFileSync(file, 'utf8');

// replace the hardcoded executeTradeOnAccount with the autoTrader
content = content.replace(
  'import { getMetaApiStatus, executeTradeOnAccount } from "./metaApiFeed.js";',
  'import { getMetaApiStatus, executeTradeOnAccount } from "./metaApiFeed.js";\nimport { executeTradeWithCapitalManagement } from "./autoTrader.js";'
);

const targetDemo = `            await executeTradeOnAccount(demoId, "DEMO", signal.signal, signal.stopLoss, signal.takeProfit, 0.01);`;
const replaceDemo = `            await executeTradeWithCapitalManagement(demoId, "DEMO", signal.signal, signal.stopLoss, signal.takeProfit, signal.entryPrice);`;
content = content.replace(targetDemo, replaceDemo);

const targetReal = `            await executeTradeOnAccount(realId, "REAL", signal.signal, signal.stopLoss, signal.takeProfit, 0.01);`;
const replaceReal = `            await executeTradeWithCapitalManagement(realId, "REAL", signal.signal, signal.stopLoss, signal.takeProfit, signal.entryPrice);`;
content = content.replace(targetReal, replaceReal);

fs.writeFileSync(file, content);
console.log("Patched signalScheduler.ts to use AutoTrader");
