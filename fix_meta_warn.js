const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

code = code.replace(
  /logger\.warn\(\{ accountId, err: accErr\.message \|\| String\(accErr\) \}, "Failed connecting to candidate account, trying fallback\.\.\."\);/,
  "if ((accErr.message || String(accErr)).includes('does not exist')) {\n                    logger.debug({ accountId, err: accErr.message || String(accErr) }, \"Failed connecting to candidate account, trying fallback...\");\n                } else {\n                    logger.warn({ accountId, err: accErr.message || String(accErr) }, \"Failed connecting to candidate account, trying fallback...\");\n                }"
);

fs.writeFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', code);
