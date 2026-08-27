const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `const SYMBOL = process.env.META_API_SYMBOL || "XAUUSD";`;
const target2 = `const envSymbol = process.env.META_API_SYMBOL || "XAUUSD";
const SYMBOL = envSymbol === "GOLD" ? "XAUUSD" : envSymbol;`;
const replacement = `const envSymbol = process.env.META_API_SYMBOL || "XAUUSD";
const SYMBOL = (envSymbol === "GOLD" || envSymbol === "OANDA:XAU_USD" || envSymbol === "XAU/USD") ? "XAUUSD" : envSymbol;`;

if (content.includes(target2)) {
  content = content.replace(target2, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED SYMBOL FROM TARGET 2");
} else if (content.includes(target1)) {
  content = content.replace(target1, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED SYMBOL FROM TARGET 1");
} else {
  console.log("COULD NOT FIND SYMBOL CONSTANT TO PATCH. FULL FILE CONTENT:");
  console.log(content.substring(0, 500));
}
