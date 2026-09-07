const fs = require('fs');
const file = 'lib/db/src/dao.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('  // Strictly enforce real account auto trading to ALWAYS be false\n  settings.autoTradingRealEnabled = false;\n', '');
content = content.replace('  // Strictly enforce real account auto trading to ALWAYS be false\n  updated.autoTradingRealEnabled = false;\n', '');
fs.writeFileSync(file, content);
