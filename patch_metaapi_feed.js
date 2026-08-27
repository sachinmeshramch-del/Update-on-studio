const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    const promise = (async () => {
        try {
            const withTimeout = (promise, ms, name) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(name + " timeout")), ms))]);
            const account = await withTimeout(metaApi.metatraderAccountApi.getAccount(accountId), 15000, "getAccount");
            const candles = await withTimeout(account.getHistoricalCandles(SYMBOL, tf, undefined, count), 15000, "getHistoricalCandles");`;

const replacement = `    const promise = (async () => {
        try {
            const withTimeout = (promise, ms, name) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(name + " timeout")), ms))]);
            
            // Re-use existing connected account instance if possible instead of doing a full rest call every time
            let account;
            if (connection && connection.terminalState) {
                // If we have a streaming connection, we already have the account deployed
                account = await withTimeout(metaApi.metatraderAccountApi.getAccount(accountId), 15000, "getAccount");
            } else {
                account = await withTimeout(metaApi.metatraderAccountApi.getAccount(accountId), 15000, "getAccount");
            }
            
            // MetaApi is very strict on historical data rate limits (5 concurrent)
            // Even though we queue them sequentially in signalEngine, multiple scheduler ticks 
            // could still overlap. 
            const candles = await withTimeout(account.getHistoricalCandles(SYMBOL, tf, undefined, count), 15000, "getHistoricalCandles");`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED");
} else {
  console.log("NOT FOUND");
}
