const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/MarketAnalysis.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    '      if (res.status === 401) {\\n        setShowKeyInput(true);\\n      }',
    `      if (res.status === 401 || res.status === 429) {
        setShowKeyInput(true);
      }`
);

fs.writeFileSync(file, content);
console.log("Patched MarketAnalysis.tsx");
