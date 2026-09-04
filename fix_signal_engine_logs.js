const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/signalEngine.ts', 'utf8');

code = code.replace(
  /"MetaApi historical candle fetch failed, falling back to public market feed"/g,
  '"MetaApi historical candle fetch failed (no fallback permitted)"'
);

fs.writeFileSync('./artifacts/api-server/src/lib/signalEngine.ts', code);
