const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("    activeAccountId = accountId;\n    }\n        \n    if (metaApiStatus === \"connecting\")", "    activeAccountId = accountId;\n        \n    if (metaApiStatus === \"connecting\")");
fs.writeFileSync(file, content);
