const fs = require('fs');

// 1. Fix polygonStream.ts
let polyCode = fs.readFileSync('./artifacts/api-server/src/lib/polygonStream.ts', 'utf8');
polyCode = polyCode.replace(
  /if \(dataSource === "metaapi" && getMetaApiStatus\(\) === "connected"\) return;/g,
  "if (dataSource === \"metaapi\") return; // strictly no fallback if metaapi is chosen"
);
fs.writeFileSync('./artifacts/api-server/src/lib/polygonStream.ts', polyCode);

// 2. Fix twelveDataStream.ts
let tdCode = fs.readFileSync('./artifacts/api-server/src/lib/twelveDataStream.ts', 'utf8');
tdCode = tdCode.replace(
  /if \(dataSource !== "metaapi" \|\| getMetaApiStatus\(\) !== "connected"\) \{\n\s*setLatestPrice\(live\);\n\s*\}/,
  "if (dataSource === \"metaapi\") return;\n    setLatestPrice(live);"
);
fs.writeFileSync('./artifacts/api-server/src/lib/twelveDataStream.ts', tdCode);
