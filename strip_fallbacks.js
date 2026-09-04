const fs = require('fs');

// 1. Clean polygonStream.ts
let polyCode = fs.readFileSync('./artifacts/api-server/src/lib/polygonStream.ts', 'utf8');
polyCode = polyCode.replace(/setInterval\([\s\S]*?\}, 2000\);/m, '// fallback polling completely disabled');
fs.writeFileSync('./artifacts/api-server/src/lib/polygonStream.ts', polyCode);

// 2. Clean routes/trading.ts
let tradingCode = fs.readFileSync('./artifacts/api-server/src/routes/trading.ts', 'utf8');
// Replace the fallback logic blocks
tradingCode = tradingCode.replace(/if \(!live\) \{\s*const fallback = await fetchGoldPrice\(\);[\s\S]*?live = liveFallback;\s*\}\s*\}/g, "");
fs.writeFileSync('./artifacts/api-server/src/routes/trading.ts', tradingCode);

// 3. Clean routes/ai.ts
let aiCode = fs.readFileSync('./artifacts/api-server/src/routes/ai.ts', 'utf8');
aiCode = aiCode.replace(/if \(!livePrice\) \{\s*const fallback = await fetchGoldPrice\(\);[\s\S]*?setLatestPrice\(livePrice\);\s*\}\s*\}/g, "");
fs.writeFileSync('./artifacts/api-server/src/routes/ai.ts', aiCode);

