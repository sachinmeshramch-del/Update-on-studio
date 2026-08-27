const fs = require('fs');
let file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/return res\.status\(503\)\.json\(\{ error: "Market data unavailable" \}\);/g, `res.status(503).json({ error: "Market data unavailable" });\n          return;`);

fs.writeFileSync(file, content);
