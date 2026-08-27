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
// include pages too!
const pageFiles = walk('artifacts/gold-swing-ai/src/pages');
const allFiles = files.concat(pageFiles);

const colorsToPatch = ['green', 'red', 'amber', 'blue', 'emerald', 'orange', 'purple', 'sky', 'zinc'];

allFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  colorsToPatch.forEach(color => {
    // We are looking for text-{color}-400 optionally followed by /XX
    const regex = new RegExp(\`\\\\btext-\${color}-400(\\\\/[0-9]+)?\\\\b\`, "g");
    content = content.replace(regex, (match, opacity) => {
      const op = opacity || '';
      return \`text-\${color}-600\${op} dark:text-\${color}-400\${op}\`;
    });
    
    // Also patch text-{color}-300 just in case
    const regex300 = new RegExp(\`\\\\btext-\${color}-300(\\\\/[0-9]+)?\\\\b\`, "g");
    content = content.replace(regex300, (match, opacity) => {
      const op = opacity || '';
      return \`text-\${color}-700\${op} dark:text-\${color}-300\${op}\`;
    });
    
    // Also patch text-{color}-500 just in case
    const regex500 = new RegExp(\`\\\\btext-\${color}-500(\\\\/[0-9]+)?\\\\b\`, "g");
    content = content.replace(regex500, (match, opacity) => {
      const op = opacity || '';
      return \`text-\${color}-700\${op} dark:text-\${color}-500\${op}\`;
    });
  });

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log("Patched: " + file);
  }
});
