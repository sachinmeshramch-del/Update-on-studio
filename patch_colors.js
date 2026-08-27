const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/bg-\[#111318\]/g, 'bg-card');
content = content.replace(/bg-\[#0d0f14\]/g, 'bg-background');
content = content.replace(/bg-\[#0a1a0f\]/g, 'dark:bg-[#0a1a0f] bg-green-500/10');
content = content.replace(/bg-\[#1a0a0a\]/g, 'dark:bg-[#1a0a0a] bg-red-500/10');
content = content.replace(/border-white\/5/g, 'border-border');
content = content.replace(/border-white\/8/g, 'border-border');
content = content.replace(/border-white\/10/g, 'border-border');

fs.writeFileSync(file, content);
console.log("Patched Header Colors");
