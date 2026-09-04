const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/polygonStream.ts', 'utf8');

code = code.replace(/goldprice\.org gap-filler/g, 'yahoo finance gap-filler');
code = code.replace(/"goldprice"/g, '"yahoo"');

fs.writeFileSync('./artifacts/api-server/src/lib/polygonStream.ts', code);
