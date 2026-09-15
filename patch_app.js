const fs = require('fs');
const file = 'artifacts/api-server/src/app.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace the naive startsWith('/assets/') with a robust regex
code = code.replace(
  /if \(req\.path\.startsWith\('\/assets\/'\)\) \{/g,
  `if (req.path.match(/\\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff2?|map)$/i)) {`
);

fs.writeFileSync(file, code);
