const fs = require('fs');
const file = 'artifacts/api-server/src/app.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `const __dirname = path.dirname(__filename);`;
const replacement = `const __dirname = path.dirname(__filename);
console.log("APP START: __dirname is", __dirname);
const publicPath = path.join(__dirname, "../../gold-swing-ai/dist/public");
console.log("APP START: publicPath is", publicPath);
console.log("APP START: exists?", fs.existsSync(publicPath));
if (fs.existsSync(publicPath)) {
  console.log("APP START: contents:", fs.readdirSync(publicPath));
}`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Patched app.ts");
