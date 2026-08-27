const fs = require('fs');
let file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/let price: number;\n    if \(live\) {\n        price = live\.price;\n    } else {\n        const p = getLatestPrice\(\); if\(\!p\) throw new Error\("No price"\); price = p\.price;\n    }/, `let price: number;
    if (live) {
        price = live.price;
    } else {
        const p = getLatestPrice(); 
        if(!p) {
          return res.status(503).json({ error: "Market data unavailable" });
        }
        price = p.price;
    }`);

fs.writeFileSync(file, content);
