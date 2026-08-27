const fs = require('fs');
let content = fs.readFileSync('artifacts/gold-swing-ai/src/components/trading/analytics-panel.tsx', 'utf8');
content = content.replace(/bg-white\/40/g, 'bg-black/40 dark:bg-white/40');
content = content.replace(/bg-white\/30/g, 'bg-black/30 dark:bg-white/30');
content = content.replace(/bg-white\/3/g, 'bg-black/5 dark:bg-white/5');
fs.writeFileSync('artifacts/gold-swing-ai/src/components/trading/analytics-panel.tsx', content);
console.log('patched analytics');
