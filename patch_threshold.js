const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('const MIN_CONF_NORMAL         = 70;', 'const MIN_CONF_NORMAL         = 50;');
content = content.replace('const MIN_CONF_STRONG         = 70;', 'const MIN_CONF_STRONG         = 65;');
content = content.replace('const MIN_CONF_REVERSAL       = 70;', 'const MIN_CONF_REVERSAL       = 60;');
content = content.replace('const MIN_CONF_RANGE          = 70;', 'const MIN_CONF_RANGE          = 55;');

fs.writeFileSync(file, content);
