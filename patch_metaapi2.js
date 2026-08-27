const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/catch \(err\)/g, 'catch (err: any)');
fs.writeFileSync(file, content);
