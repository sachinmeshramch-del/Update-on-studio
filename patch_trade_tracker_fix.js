const fs = require('fs');
const file = 'artifacts/api-server/src/lib/tradeTracker.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    '        }\n      }\n      }\n\n      if (newStatus',
    '        }\n      }\n\n      if (newStatus'
);

fs.writeFileSync(file, content);
