const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

code = code.replace(
  /logger\.info\(\{ syncErr: syncErr\?\.message \}, "Streaming synchronization in progress, proceeding\.\.\."\);/g,
  "// Silently proceed on harmless validation or timeout errors during sync\n                        logger.debug({ syncErr: syncErr?.message }, \"Streaming synchronization in progress, proceeding...\");"
);

code = code.replace(
  /logger\.warn\(\{ syncErr: syncErr\?\.message \}, "\[MetaApi RPC\] waitSynchronized threw an error, proceeding anyway\.\.\."\);/g,
  "// Silently proceed on harmless validation or timeout errors during sync\n            logger.debug({ syncErr: syncErr?.message }, \"[MetaApi RPC] waitSynchronized threw an error, proceeding anyway...\");"
);

fs.writeFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', code);
