const fs = require('fs');

function getIndent(line) {
    if (line.trim() === '') return null;
    return line.length - line.trimStart().length;
}

let lines = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts.bak', 'utf8').split('\n');
let fixed = [];
let currentIndent = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = getIndent(line);
    
    if (indent !== null && !line.trimStart().startsWith('//')) {
        // If the indentation drops, we might be missing braces
        if (indent < currentIndent) {
            // Check if the current line already contains closing braces that account for the drop
            // Actually, wait. The line itself might be a `} else {` which is indented at `indent`.
            // But if the line is NOT a closing brace itself, or only partially closes, we need to insert missing ones.
            // Since we ONLY deleted lines consisting purely of `    }` or `        }` or `            );`, 
            // if we see a drop in indentation, and the line is NOT `}` or `});`, we should insert them BEFORE this line!
            
            let spacesDropped = currentIndent - indent;
            let bracesNeeded = spacesDropped / 4;
            
            // Wait, if the line ITSELF is `}` or `} else {`, it accounts for ONE of the drops.
            if (line.trimStart().startsWith('}')) {
                bracesNeeded -= 1;
            } else if (line.trimStart().startsWith(');')) {
                bracesNeeded -= 1; // It was probably `});` or something
            }
            
            for (let b = 0; b < bracesNeeded; b++) {
                // Insert a closing brace at the right indentation
                const braceIndent = currentIndent - (b + 1) * 4;
                // If it was the `            );` that was deleted, maybe we should insert `});` instead of `}`?
                // But `}` is valid TypeScript syntax to close blocks. 
                // Wait! `            );` was specifically deleted.
                // It's safer to just look at the exact strings my bad sed deleted!
                
                // Let's not guess based on indentation generally.
                // I deleted exactly THREE strings:
                // 1. `            );`
                // 2. `        }`
                // 3. `    }`
            }
        }
        currentIndent = indent;
    }
    
    // Actually, looking at the exact deleted strings is better!
}
