const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

content = content.replace(
  `metaApiStatus = "connecting";`,
  `metaApiStatus = "connecting";\n    logger.info("Starting MetaApi feed initialization...");`
);
content = content.replace(
  `const settings = await getSystemSettings();`,
  `logger.info("Fetching settings...");\n        const settings = await getSystemSettings();\n        logger.info("Settings fetched: " + JSON.stringify(settings));`
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', content);
