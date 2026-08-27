const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/routes/settings.ts', 'utf8');

content = content.replace(
  /startMetaApiFeed\(\)\.catch/g,
  `stopMetaApiFeed().then(() => startMetaApiFeed()).catch`
);

fs.writeFileSync('artifacts/api-server/src/routes/settings.ts', content);
