const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'const SYMBOL = (process.env.META_API_SYMBOL || "XAUUSD").trim();',
    `let SYMBOL = (process.env.META_API_SYMBOL || "XAUUSD").trim();\nif (SYMBOL.toUpperCase() === "GOLD") SYMBOL = "XAUUSD";`
);

fs.writeFileSync(file, content);
