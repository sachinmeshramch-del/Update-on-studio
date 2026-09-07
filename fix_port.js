const fs = require('fs');
const file = 'artifacts/api-server/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('const port = process.env.PORT || 3000;', 'const port = 3000;');
fs.writeFileSync(file, content);
console.log("Fixed port to 3000");
