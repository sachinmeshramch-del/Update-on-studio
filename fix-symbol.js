const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const envSymbol = process.env.META_API_SYMBOL || "XAUUSD";\nconst SYMBOL = (envSymbol === "GOLD" || envSymbol === "OANDA:XAU_USD" || envSymbol === "XAU/USD") ? "XAUUSD" : envSymbol;',
  'const SYMBOL = (process.env.META_API_SYMBOL || "XAUUSD").trim();'
);

fs.writeFileSync(file, content);
console.log("Patched metaApiFeed.ts");
