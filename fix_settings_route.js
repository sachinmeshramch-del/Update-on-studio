const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/routes/settings.ts', 'utf8');

content = content.replace(
  /oldSettings\.demoAccountId !== settings\.demoAccountId/g,
  `oldSettings.demoAccountId !== settings.demoAccountId ||
        oldSettings.metaApiSymbol !== settings.metaApiSymbol`
);

fs.writeFileSync('artifacts/api-server/src/routes/settings.ts', content);
