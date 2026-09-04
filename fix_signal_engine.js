const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/signalEngine.ts', 'utf8');

code = code.replace(
  /const { fetchOHLC } = await import\("\.\/goldPrice\.js"\);\s*return await fetchOHLC\(tf\);/,
  "throw new Error(`Primary data source unavailable for ${tf} candles.`);"
);

fs.writeFileSync('./artifacts/api-server/src/lib/signalEngine.ts', code);
