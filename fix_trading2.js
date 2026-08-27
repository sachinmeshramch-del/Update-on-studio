const fs = require('fs');
let file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const priceData = getLatestPrice\(\);\n      if \(\!priceData\) return res\.status\(503\)\.json\(\{ error: "Market data unavailable" \}\);\n      res\.json\(priceData\);/g, `const priceData = getLatestPrice();
      if (!priceData) {
        res.status(503).json({ error: "Market data unavailable" });
        return;
      }
      res.json(priceData);`);

fs.writeFileSync(file, content);
