const fs = require('fs');
const file = 'artifacts/api-server/src/routes/ai.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/catch \(error\)/g, 'catch (error: any)');
fs.writeFileSync(file, content);
console.log("Patched ai.ts");
