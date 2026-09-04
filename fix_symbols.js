const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

// 1. Add CNH to isForeign
code = code.replace(
  /u\.includes\('CAD'\) \|\| u\.includes\('SGD'\) \|\| u\.includes\('HKD'\);/,
  "u.includes('CAD') || u.includes('SGD') || u.includes('HKD') || u.includes('CNH') || u.includes('TRY') || u.includes('ZAR') || u.includes('THB');"
);

// 2. Reduce noise from historical candles fallback
code = code.replace(
  /logger\.warn\(\{ tf, err: \(metaErr as any\)\?\.message \}, "MetaApi historical candle fetch failed, falling back to public market feed"\);/g,
  "// logger.debug({ tf, err: (metaErr as any)?.message }, \"MetaApi historical candle fetch failed, falling back to public market feed\");"
);

fs.writeFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', code);
