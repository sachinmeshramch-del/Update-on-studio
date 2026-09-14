const fs = require("fs");
const file = "artifacts/api-server/src/lib/metaApiFeed.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
    /if \(account\.state !== 'DEPLOYED'\) \{\n\s+await Promise\.race\(\[\n\s+account\.deploy\(\),\n\s+new Promise\(\(\_, reject\) => setTimeout\(\(\) => reject\(new Error\("Deploy timeout"\)\), 4000\)\)\n\s+\]\)\.catch\(\(\) => \{\}\);\n\s+\}/g,
    "if (account.state !== 'DEPLOYED') {\n        try { await account.deploy(); } catch (e) { console.error(\"[MetaApi] RPC Forced deploy failed:\", e?.message || e); }\n        try { await account.waitConnected(120); } catch (e) { console.warn(\"[MetaApi] waitConnected timed out in RPC init.\"); }\n    }"
);

fs.writeFileSync(file, code);
console.log("Patched rpc init");
