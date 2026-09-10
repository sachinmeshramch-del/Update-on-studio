const fs = require('fs');
const lines = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts.bak', 'utf8').split('\n');

const fixed = [];
let indentLevel = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.startsWith('export ') || trimmed.startsWith('const ') || trimmed.startsWith('let ')) {
        // Assume all top-level statements should be at indentLevel 0
        while (indentLevel > 0) {
            fixed.push(' '.repeat((indentLevel - 1) * 4) + '}');
            indentLevel--;
        }
    } else if (trimmed === '') {
        fixed.push(line);
        continue;
    }
    
    // Check missing braces based on next line indentation?
    // Let's just do a naive count:
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    
    fixed.push(line);
    indentLevel += (openBraces - closeBraces);
}

while (indentLevel > 0) {
    fixed.push(' '.repeat((indentLevel - 1) * 4) + '}');
    indentLevel--;
}

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts.fixed', fixed.join('\n'));
