const fs = require('fs');
let content = fs.readFileSync('artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx', 'utf8');

content = content.replace(
  `checked={formData.autoTradingDemoEnabled}`,
  `checked={formData.autoTradingDemoEnabled ?? false}`
);
content = content.replace(
  `checked={formData.autoTradingRealEnabled}`,
  `checked={formData.autoTradingRealEnabled ?? false}`
);

fs.writeFileSync('artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx', content);
