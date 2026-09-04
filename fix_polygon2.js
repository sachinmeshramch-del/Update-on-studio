const fs = require('fs');
let polyCode = fs.readFileSync('./artifacts/api-server/src/lib/polygonStream.ts', 'utf8');
polyCode = polyCode.replace(/fallbackTimer = \/\/ fallback polling completely disabled\}/m, '// fallback polling completely disabled\n}');
fs.writeFileSync('./artifacts/api-server/src/lib/polygonStream.ts', polyCode);
