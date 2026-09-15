const fs = require('fs');
const file = 'artifacts/gold-swing-ai/vite.config.ts';
let code = fs.readFileSync(file, 'utf8');

// Force base path to '/' to prevent deployment pipeline overrides from breaking asset paths
code = code.replace(/base: basePath,/g, 'base: "/",');

fs.writeFileSync(file, code);
