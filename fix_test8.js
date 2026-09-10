const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');

const regex = /}, "Error closing MetaApi connection"\);\s+connection = null;\s+activeAccountObj = null;\s+metaApiStatus = "disconnected";\s+isListenerAttached = false;\s+isConnecting = false;\s+\}/m;
code = code.replace(regex, "");
fs.writeFileSync('test.ts', code);
