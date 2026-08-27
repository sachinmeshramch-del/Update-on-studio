const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace history logic
code = code.replace(
  /const rpcConnection = account\.getRPCConnection\(\);[\s\S]*?const candles = await rpcConnection\.calculateHistoryCandles\(SYMBOL, tf, count\);/,
  'const candles = await account.getHistoricalCandles(SYMBOL, tf, undefined, count);'
);

// Add missing listeners
code = code.replace(
  'onBrokerConnectionStatusChanged: () => {},',
  `onBrokerConnectionStatusChanged: () => {},
            onSymbolSpecificationsUpdated: () => {},
            onSymbolPricesUpdated: () => {},`
);

fs.writeFileSync(file, code);
