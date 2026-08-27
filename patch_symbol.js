const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `const envSymbol = process.env.META_API_SYMBOL || "XAUUSD";
const SYMBOL = (envSymbol === "GOLD" || envSymbol === "OANDA:XAU_USD" || envSymbol === "XAU/USD") ? "XAUUSD" : envSymbol;`;
const replacement = `const SYMBOL = process.env.META_API_SYMBOL || "XAUUSD";`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("Reverted SYMBOL hack");
} else {
  console.log("Not found");
}
