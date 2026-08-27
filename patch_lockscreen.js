const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/LockScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '<h1 className="text-2xl font-bold tracking-tight">Gold Swing AI</h1>',
  '<h1 className="text-2xl font-bold tracking-tight">Enter PIN</h1>'
);

content = content.replace(
  /<p className="text-sm text-muted-foreground">\s*Please enter your PIN to continue\.\s*<\/p>/g,
  ''
);

fs.writeFileSync(file, content);
console.log("Patched");
