const fs = require('fs');
const file = 'artifacts/api-server/src/routes/ai.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'model: "gemini-2.5-flash",',
    'model: "gemini-3.6-flash",'
);

fs.writeFileSync(file, content);
console.log("Patched ai.ts to use gemini-3.6-flash");
