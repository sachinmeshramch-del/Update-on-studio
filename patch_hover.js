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

allFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  content = content.replace(/hover:dark:bg-white\/5 bg-black\/5/g, 'hover:bg-black/5 dark:hover:bg-white/5');
  content = content.replace(/hover:dark:bg-white\/10 bg-black\/10/g, 'hover:bg-black/10 dark:hover:bg-white/10');
  content = content.replace(/hover:dark:bg-white\/20 bg-black\/20/g, 'hover:bg-black/20 dark:hover:bg-white/20');
  
  // also fix if the order was swapped
  content = content.replace(/dark:bg-white\/5 bg-black\/5/g, 'bg-black/5 dark:bg-white/5');
  content = content.replace(/dark:bg-white\/10 bg-black\/10/g, 'bg-black/10 dark:bg-white/10');
  content = content.replace(/dark:bg-white\/20 bg-black\/20/g, 'bg-black/20 dark:bg-white/20');
  
  // same for hover:text
  content = content.replace(/hover:text-amber-600 dark:text-amber-400/g, 'hover:text-amber-600 dark:hover:text-amber-400');
  content = content.replace(/hover:text-red-600 dark:text-red-400/g, 'hover:text-red-600 dark:hover:text-red-400');
  content = content.replace(/hover:text-green-600 dark:text-green-400/g, 'hover:text-green-600 dark:hover:text-green-400');
  content = content.replace(/hover:text-blue-600 dark:text-blue-400/g, 'hover:text-blue-600 dark:hover:text-blue-400');

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log('Patched hover states in:', file);
  }
});
