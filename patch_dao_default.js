const fs = require('fs');
const file = 'lib/db/src/dao.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("realAccountId: '',", "realAccountId: process.env.META_ACCOUNT_ID || '',");
fs.writeFileSync(file, content);
