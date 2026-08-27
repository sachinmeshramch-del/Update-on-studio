const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

content = content.replace(
  /await Promise\.race\(\[\n\s*connection\.waitSynchronized\(\),\n\s*new Promise\(\(_, reject\) => setTimeout\(\(\) => reject\(new Error\("waitSynchronized timeout"\)\), 30000\)\)\n\s*\]\);/g,
  "await connection.waitSynchronized();"
);

content = content.replace(
  /const rpc = await account\.getRPC\(\);/g,
  "const rpc = await account.getRPCConnection();\n            await rpc.connect();\n            await rpc.waitSynchronized();"
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', content);
