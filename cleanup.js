const fs = require('fs');
const file = 'artifacts/api-server/src/routes/trading.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/router\.get\('\/clean-test'[\s\S]*?\}\);/g, '');

fs.writeFileSync(file, code);
