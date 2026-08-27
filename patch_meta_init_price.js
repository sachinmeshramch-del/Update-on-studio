const fs = require('fs');
let file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `const live = {
                    price: Number(((initialPrice.bid + initialPrice.ask) / 2).toFixed(2)),
                    bid: initialPrice.bid,
                    ask: initialPrice.ask,
                    spread,
                    change: 0,
                    changePercent: 0,
                    high24h: Number(((initialPrice.bid + initialPrice.ask) / 2).toFixed(2)),
                    low24h: Number(((initialPrice.bid + initialPrice.ask) / 2).toFixed(2)),
                    timestamp: new Date().toISOString(),
                    direction: "unchanged",
                    ms: initialPrice.time ? initialPrice.time.getTime() : Date.now(),
                    source: "metaapi"
                };`;

content = content.replace(/const live = \{\s*price:[^]*?source: "metaapi"\s*\};/g, replacement);
fs.writeFileSync(file, content);
console.log("Patched successfully");
