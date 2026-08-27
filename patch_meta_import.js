const fs = require('fs');
let file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('await import("metaapi.cloud-sdk");', 'await import("metaapi.cloud-sdk/esm-node");');

fs.writeFileSync(file, content);
console.log("Patched import!");
