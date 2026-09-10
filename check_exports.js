const fs = require('fs');
let lines = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8').split('\n');
for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('export ')) {
        const prevLine = lines[i-1].trim();
        if (prevLine !== '}' && prevLine !== '' && prevLine !== '});' && prevLine !== '}') {
            console.log("Potential missing brace before line " + (i+1) + ": " + lines[i]);
            console.log("Prev line was: " + lines[i-1]);
        }
    }
}
