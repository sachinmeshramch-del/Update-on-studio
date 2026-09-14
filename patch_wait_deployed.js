const fs = require("fs");
const file = "artifacts/api-server/src/lib/metaApiFeed.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
    /try \{ await account\.deploy\(\); \} catch \(e\) \{ console\.error\("\[MetaApi\] RPC Forced deploy failed:", e\?\.message \|\| e\); \}/g,
    "try { await account.deploy(); await account.waitDeployed(120); } catch (e) { console.error(\"[MetaApi] RPC Forced deploy failed:\", e?.message || e); }"
);

code = code.replace(
    /try \{ await account\.deploy\(\); \} catch \(e\) \{ console\.error\("\[MetaApi\] Forced deploy failed:", e\?\.message \|\| e\); \}/g,
    "try { await account.deploy(); await account.waitDeployed(120); } catch (e) { console.error(\"[MetaApi] Forced deploy failed:\", e?.message || e); }"
);

code = code.replace(
    /logger\.info\(\{ accountId, state: account\.state \}, "Deploying MetaApi account\.\.\."\);\n\s+await account\.deploy\(\);/g,
    "logger.info({ accountId, state: account.state }, \"Deploying MetaApi account...\");\n                    await account.deploy();\n                    await account.waitDeployed(120);"
);

fs.writeFileSync(file, code);
console.log("Patched waitDeployed");
