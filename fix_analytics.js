const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/analytics-panel.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('t => (', '(t: any) => (');
fs.writeFileSync(file, content);
console.log("Fixed analytics panel ts error");
