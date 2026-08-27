const fs = require('fs');
let content = fs.readFileSync('artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx', 'utf8');

content = content.replace(
  /autoTradingRealEnabled: boolean;/g,
  `autoTradingRealEnabled: boolean;\n  metaApiSymbol?: string;`
);

fs.writeFileSync('artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx', content);
