const fs = require('fs');

// Patch signalScheduler.ts
let file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('import { fetchGoldPrice } from "./goldPrice.js";\n', '');
content = content.replace('const price = live?.price ?? (await fetchGoldPrice()).price;', 'const price = live?.price;\n    if (!price) {\n      logger.warn("Skipping signal evaluation: no live price available");\n      return;\n    }');
fs.writeFileSync(file, content);

// Patch routes/trading.ts
file = 'artifacts/api-server/src/routes/trading.ts';
content = fs.readFileSync(file, 'utf8');
content = content.replace('import { fetchGoldPrice } from "../lib/goldPrice.js";', 'import { getLatestPrice } from "../lib/priceEvents.js";');
content = content.replace(/const priceData = await fetchGoldPrice\(\);/g, 'const priceData = getLatestPrice();\n      if (!priceData) return res.status(503).json({ error: "Market data unavailable" });');
content = content.replace('price = (await fetchGoldPrice()).price;', 'const p = getLatestPrice(); if(!p) throw new Error("No price"); price = p.price;');
fs.writeFileSync(file, content);

// Patch routes/ai.ts
file = 'artifacts/api-server/src/routes/ai.ts';
content = fs.readFileSync(file, 'utf8');
content = content.replace('import { fetchGoldPrice } from "../lib/goldPrice.js";\n', '');
content = content.replace('const livePrice = getLatestPrice() || await fetchGoldPrice().catch(() => null);', 'const livePrice = getLatestPrice();');
fs.writeFileSync(file, content);

