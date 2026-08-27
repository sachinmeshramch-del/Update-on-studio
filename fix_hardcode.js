const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

content = content.replace(
  /if \(SYMBOL\.toUpperCase\(\) === "GOLD"\) SYMBOL = "XAUUSD";\n/g,
  ""
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', content);
