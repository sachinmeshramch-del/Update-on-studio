const fs = require('fs');
const file = 'artifacts/api-server/src/lib/polygonStream.ts';
let content = fs.readFileSync(file, 'utf8');

content = `import { getMetaApiStatus } from "./metaApiFeed.js";\n` + content;

content = content.replace(
  `// Skip if TwelveData is active (primary)\n    if (Date.now() - getLastTwelveDataTickMs() <= TD_STALE_MS) return;`,
  `// Skip if MetaApi is active
    const dataSource = process.env.DATA_SOURCE || "twelvedata";
    if (dataSource === "metaapi" && getMetaApiStatus() === "connected") return;
    
    // Skip if TwelveData is active (primary)
    if (Date.now() - getLastTwelveDataTickMs() <= TD_STALE_MS) return;`
);

fs.writeFileSync(file, content);
