const fs = require('fs');
let file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('import { withTimeout } from "./utils.js";\n', '');
content = content.replace('const candles = await withTimeout(account.getHistoricalCandles(SYMBOL, tf, undefined, count), 15000, "getHistoricalCandles");', 'const candles = await account.getHistoricalCandles(SYMBOL, tf, undefined, count);');

content = content.replace('const accountId = settings.metaAccountId;', 'const accountId = (settings as any).metaAccountId || settings.realAccountId || settings.demoAccountId;');

fs.writeFileSync(file, content);
console.log("Fixed errors!");
