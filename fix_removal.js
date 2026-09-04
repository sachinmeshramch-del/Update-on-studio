const fs = require('fs');
// 1. Remove polygonStream.ts
if (fs.existsSync('./artifacts/api-server/src/lib/polygonStream.ts')) {
    fs.unlinkSync('./artifacts/api-server/src/lib/polygonStream.ts');
}
// 2. Remove twelveDataStream.ts
if (fs.existsSync('./artifacts/api-server/src/lib/twelveDataStream.ts')) {
    fs.unlinkSync('./artifacts/api-server/src/lib/twelveDataStream.ts');
}
// 3. Clean goldPrice.ts
fs.writeFileSync('./artifacts/api-server/src/lib/goldPrice.ts', `export interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  timestamp: string;
}

export interface OHLCCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
`);

// 4. Update routes/trading.ts
let tradingCode = fs.readFileSync('./artifacts/api-server/src/routes/trading.ts', 'utf8');
tradingCode = tradingCode.replace(/import \{ fetchGoldPrice \} from "\.\.\/lib\/goldPrice\.js";\n/, '');
tradingCode = tradingCode.replace(/import \{ getTwelveDataStatus \} from "\.\.\/lib\/twelveDataStream\.js";\n/, '');
tradingCode = tradingCode.replace(/import \{ getFinnhubStatus \} from "\.\.\/lib\/polygonStream\.js";\n/, '');
tradingCode = tradingCode.replace(/\s*twelvedata: getTwelveDataStatus\(\),\s*finnhub: getFinnhubStatus\(\),/, '');
fs.writeFileSync('./artifacts/api-server/src/routes/trading.ts', tradingCode);

// 5. Update routes/ai.ts
let aiCode = fs.readFileSync('./artifacts/api-server/src/routes/ai.ts', 'utf8');
aiCode = aiCode.replace(/import \{ fetchGoldPrice \} from "\.\.\/lib\/goldPrice\.js";\n/, '');
fs.writeFileSync('./artifacts/api-server/src/routes/ai.ts', aiCode);
