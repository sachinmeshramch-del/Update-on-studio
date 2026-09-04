const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/goldPrice.ts', 'utf8');

code = code.replace(
  /\(await tryGoldPriceOrg\(\)\) \?\?\n\s*/,
  ""
);

code = code.replace(
  /\/\/ ── Source 1: goldprice\.org \(near real-time, ~1-2s delay\) ──────────────────[\s\S]*?\/\/ ── Source 2: Yahoo Finance \(15-min delayed, but reliable fallback\) ─────────/,
  "// ── Source 1: Yahoo Finance (15-min delayed, but reliable fallback) ─────────"
);

fs.writeFileSync('./artifacts/api-server/src/lib/goldPrice.ts', code);
