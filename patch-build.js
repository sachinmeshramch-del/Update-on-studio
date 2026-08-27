const fs = require('fs');
const file = 'artifacts/api-server/build.mjs';
let code = fs.readFileSync(file, 'utf8');
code = code.replace('"better-sqlite3",\\n', '');
fs.writeFileSync(file, code);
