const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

code = code.replace(
  /packetTimeout: 60,/,
  ""
);

fs.writeFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', code);
