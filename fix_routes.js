const fs = require('fs');

let tradingCode = fs.readFileSync('./artifacts/api-server/src/routes/trading.ts', 'utf8');
tradingCode = tradingCode.replace(/"goldprice"/g, '"yahoo"');
fs.writeFileSync('./artifacts/api-server/src/routes/trading.ts', tradingCode);

let aiCode = fs.readFileSync('./artifacts/api-server/src/routes/ai.ts', 'utf8');
aiCode = aiCode.replace(/"goldprice"/g, '"yahoo"');
fs.writeFileSync('./artifacts/api-server/src/routes/ai.ts', aiCode);
