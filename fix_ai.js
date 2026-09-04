const fs = require('fs');
let aiCode = fs.readFileSync('./artifacts/api-server/src/routes/ai.ts', 'utf8');

aiCode = aiCode.replace(
  /currentPrice = livePrice \? livePrice\.price : 4550;/,
  `if (!livePrice) {
      res.status(503).json({ error: "Market data unavailable. Please wait for active price stream." });
      return;
    }
    currentPrice = livePrice.price;`
);
fs.writeFileSync('./artifacts/api-server/src/routes/ai.ts', aiCode);
