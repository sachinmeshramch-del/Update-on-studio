const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `const account = await metaApi.metatraderAccountApi.getAccount(accountId);
            const candles = await account.getHistoricalCandles(SYMBOL, tf, undefined, count);`;

const replacement = `const withTimeout = (promise, ms, name) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(name + " timeout")), ms))]);
            const account = await withTimeout(metaApi.metatraderAccountApi.getAccount(accountId), 15000, "getAccount");
            const candles = await withTimeout(account.getHistoricalCandles(SYMBOL, tf, undefined, count), 15000, "getHistoricalCandles");`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("PATCHED");
