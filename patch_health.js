const fs = require('fs');
const file = 'artifacts/api-server/src/routes/health.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'router.get(["/healthz", "/health"], (_req, res) => {',
  'router.get(["/healthz", "/health", "/ping"], (_req, res) => {'
);
fs.writeFileSync(file, content);
console.log("Patched health.ts");
