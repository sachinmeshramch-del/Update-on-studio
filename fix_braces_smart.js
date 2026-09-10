const fs = require('fs');
let lines = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts.bak', 'utf8').split('\n');
let fixed = [];
let currentExpectedIndent = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
        fixed.push(line);
        continue;
    }
    if (line.trimStart().startsWith('//')) {
        fixed.push(line);
        continue;
    }
    
    let indent = line.length - line.trimStart().length;
    
    if (indent < currentExpectedIndent) {
        let spacesDropped = currentExpectedIndent - indent;
        let bracesNeeded = Math.floor(spacesDropped / 4);
        
        if (line.trimStart().startsWith('}') || line.trimStart().startsWith('catch') || line.trimStart().startsWith(')')) {
            bracesNeeded -= 1;
        }
        
        for (let b = 0; b < bracesNeeded; b++) {
            let braceIndent = currentExpectedIndent - (b + 1) * 4;
            // Hack for specific deleted lines like `            );`
            if (braceIndent === 12 && currentExpectedIndent === 16) { // example
                 // just output '}' and let prettier/eslint fix it if it's missing ')'
            }
            fixed.push(' '.repeat(braceIndent) + '}');
        }
    }
    
    fixed.push(line);
    
    // Update expected indent based on current line's actual indent + any newly opened blocks
    currentExpectedIndent = indent;
    let stripped = line.split('//')[0].trimEnd();
    if (stripped.endsWith('{') || stripped.endsWith('(')) {
        currentExpectedIndent += 4;
    }
}

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts.smart', fixed.join('\n'));
