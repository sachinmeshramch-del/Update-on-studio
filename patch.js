const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('artifacts/gold-swing-ai/src/components');
const allFiles = files.concat(walk('artifacts/gold-swing-ai/src/pages'));
const colorsToPatch = ['green', 'red', 'amber', 'blue', 'emerald', 'orange', 'purple', 'sky', 'zinc'];

allFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  colorsToPatch.forEach(color => {
    // 400
    let re400 = new RegExp('\\\\btext-' + color + '-400(\\\\/[0-9]+)?\\\\b', 'g');
    content = content.replace(re400, (match, opacity) => {
      let op = opacity || '';
      return 'text-' + color + '-600' + op + ' dark:text-' + color + '-400' + op;
    });
    
    // 300
    let re300 = new RegExp('\\\\btext-' + color + '-300(\\\\/[0-9]+)?\\\\b', 'g');
    content = content.replace(re300, (match, opacity) => {
      let op = opacity || '';
      return 'text-' + color + '-700' + op + ' dark:text-' + color + '-300' + op;
    });

    // 500
    let re500 = new RegExp('\\\\btext-' + color + '-500(\\\\/[0-9]+)?\\\\b', 'g');
    content = content.replace(re500, (match, opacity) => {
      let op = opacity || '';
      return 'text-' + color + '-700' + op + ' dark:text-' + color + '-500' + op;
    });
  });

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log("Patched: " + file);
  }
});
