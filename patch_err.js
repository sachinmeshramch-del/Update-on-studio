const fs = require('fs');
const file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("res.status(500).json({ error: err.message });", "res.status(500).json({ error: err instanceof Error ? err.message : String(err) });");

fs.writeFileSync(file, content);
console.log("Patched err");
