const fs = require('fs');
const file = 'artifacts/api-server/src/app.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `app.get(/.*/, (req, res) => {`;
const replacement = `app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/assets/')) {
    return res.status(404).send('Asset not found');
  }`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Patched app.ts to 404 assets");
