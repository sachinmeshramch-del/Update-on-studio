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

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  const replaceColor = (color) => {
    const regex = new RegExp("\\\\btext-" + color + "-400(\\\\/[0-9]+)?\\\\b", "g");
    content = content.replace(regex, (match, opacity) => {
      const op = opacity || '';
      return "text-" + color + "-600" + op + " dark:text-" + color + "-400" + op;
    });
  };

  replaceColor('green');
  replaceColor('red');
  replaceColor('amber');
  replaceColor('blue');
  replaceColor('emerald');

  content = content.replace(/\bbg-white\/5\b/g, 'dark:bg-white/5 bg-black/5');
  content = content.replace(/\bbg-white\/10\b/g, 'dark:bg-white/10 bg-black/10');
  content = content.replace(/\bbg-white\/20\b/g, 'dark:bg-white/20 bg-black/20');
  
  content = content.replace(/\bborder-white\/10\b/g, 'border-border');
  content = content.replace(/\bborder-white\/20\b/g, 'border-border');

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log("Patched: " + file);
  }
});
