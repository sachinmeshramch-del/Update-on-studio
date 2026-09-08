const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/index.ts', 'utf8');
code = code.replace(
  'const port = parseInt(process.env.PORT || "3000", 10);',
  'const port = 3000; // MUST BE 3000 per infrastructure constraints'
);
fs.writeFileSync('artifacts/api-server/src/index.ts', code);
