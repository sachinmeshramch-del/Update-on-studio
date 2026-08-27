const fs = require('fs');
let file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('logger.error({ err }, "MetaApi Feed error");', 'logger.error({ err }, "MetaApi Feed error"); require("fs").writeFileSync("/tmp/meta_error.log", err.stack || err.message);');

fs.writeFileSync(file, content);
console.log("Patched!");
