const fs = require('fs');
let lines = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts.bak', 'utf8').split('\n');
for (let i = 0; i < 20; i++) {
    console.log(lines[i].length - lines[i].trimStart().length, ":", lines[i]);
}
