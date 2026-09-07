const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, 'artifacts/gold-swing-ai/dist/public');
console.log("Target dir:", target);
console.log("Exists?", fs.existsSync(target));
if (fs.existsSync(target)) {
  console.log("Contents:", fs.readdirSync(target));
  const assets = path.join(target, 'assets');
  if (fs.existsSync(assets)) {
    console.log("Assets:", fs.readdirSync(assets));
  }
}
