const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /<WouterRouter base=\{import\.meta\.env\.BASE_URL[^}]+\}>/,
  '<WouterRouter>'
);

fs.writeFileSync(file, code);
