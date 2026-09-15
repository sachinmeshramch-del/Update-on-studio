const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

// If base is '/', we don't need to pass it, or we just pass it without the weird replace
code = code.replace(
  /<WouterRouter base=\{import\.meta\.env\.BASE_URL\.replace\(\/\\\/\\$\/, ""\)\}>/,
  '<WouterRouter>'
);

fs.writeFileSync(file, code);
