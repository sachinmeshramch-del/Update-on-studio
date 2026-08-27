const fs = require('fs');
let file = 'artifacts/gold-swing-ai/src/components/ui/label.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('"use client"\n', '');

fs.writeFileSync(file, content);
console.log("Removed use client from label.tsx!");
