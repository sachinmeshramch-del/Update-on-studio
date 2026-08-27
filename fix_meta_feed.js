const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

// replace the global SYMBOL init with a function or move it inside
content = content.replace(
  /let SYMBOL = \(process\.env\.META_API_SYMBOL \|\| "XAUUSD"\)\.trim\(\);\nif \(SYMBOL\.toUpperCase\(\) === "GOLD"\) SYMBOL = "XAUUSD";/g,
  `let SYMBOL = "XAUUSD";`
);

content = content.replace(
  /const settings = await getSystemSettings\(\);/g,
  `const settings = await getSystemSettings();
        const configuredSymbol = settings.metaApiSymbol || process.env.META_API_SYMBOL || "XAUUSD";
        SYMBOL = configuredSymbol.trim();
        if (SYMBOL.toUpperCase() === "GOLD") SYMBOL = "XAUUSD";`
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', content);
