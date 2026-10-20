const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  for (let file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) results = results.concat(walk(full));
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) results.push(full);
  }
  return results;
}

const files = walk('artifacts/gold-swing-ai/src');
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (/\bcn\(/.test(content)) {
    const hasImport = /import\s+[^'"]*?\bcn\b[^'"]*?from/.test(content);
    const defines = /function\s+cn\b|const\s+cn\b|let\s+cn\b/.test(content);
    if (!hasImport && !defines) {
      console.log('MISSING CN IMPORT IN:', file);
    }
  }
}
console.log('Check finished.');
