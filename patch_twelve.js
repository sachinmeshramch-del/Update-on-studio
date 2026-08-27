const fs = require('fs');
const file = 'artifacts/api-server/src/lib/twelveDataStream.ts';
let content = fs.readFileSync(file, 'utf8');

// We need to import getMetaApiStatus from metaApiFeed.js
content = `import { getMetaApiStatus } from "./metaApiFeed.js";\n` + content;

content = content.replace(
  `_lastTick = Date.now();\n    setLatestPrice(live);\n    return;`,
  `_lastTick = Date.now();
    const dataSource = process.env.DATA_SOURCE || "twelvedata";
    if (dataSource !== "metaapi" || getMetaApiStatus() !== "connected") {
      setLatestPrice(live);
    }
    return;`
);

fs.writeFileSync(file, content);
