const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');
let openCount = 0;
let closeCount = 0;
for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') openCount++;
    if (code[i] === '}') closeCount++;
}
console.log("Open:", openCount, "Close:", closeCount, "Diff:", openCount - closeCount);
