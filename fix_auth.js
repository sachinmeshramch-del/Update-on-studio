const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/lib/firebase/auth-context.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  "const storedAuth = localStorage.getItem('gold_swing_auth');",
  "let storedAuth = null; try { storedAuth = localStorage.getItem('gold_swing_auth'); } catch (e) { console.error('LocalStorage blocked', e); }"
);
fs.writeFileSync(file, content);
console.log("Fixed auth context local storage.");
