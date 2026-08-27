const fs = require('fs');
let file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace duplicate import
content = content.replace('import { getLatestPrice } from "../lib/priceEvents.js";\n', '');
fs.writeFileSync(file, content);
