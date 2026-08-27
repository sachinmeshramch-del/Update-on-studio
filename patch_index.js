const fs = require('fs');
const file = 'artifacts/api-server/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('import { startPolygonStream } from "./lib/polygonStream.js";\n', '');
content = content.replace('import { startTwelveDataStream } from "./lib/twelveDataStream.js";\n', '');

content = content.replace(`const dataSource = process.env.DATA_SOURCE || "twelvedata";
if (dataSource === "metaapi") {
  startMetaApiFeed().catch(err => {
    logger.error({ err }, "Failed to start MetaApi feed - will retry later or wait for settings");
  });
}

// Always start TwelveData (primary fallback) and Finnhub (secondary fallback)
startTwelveDataStream();
startPolygonStream();`, `// Only use MetaApi
startMetaApiFeed().catch(err => {
  logger.error({ err }, "Failed to start MetaApi feed - will retry later or wait for settings");
});`);

fs.writeFileSync(file, content);
