const fs = require("fs");
const file = "artifacts/api-server/src/lib/metaApiFeed.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
    "if (account.state !== 'DEPLOYED') {\n                    logger.info({ accountId }, \"Deploying MetaApi account...\");\n                    await account.deploy();\n                }",
    "if (account.state !== 'DEPLOYED') {\n                    logger.info({ accountId, state: account.state }, \"Deploying MetaApi account...\");\n                    await account.deploy();\n                } else {\n                    // Explicitly deploy anyway if there might be a sync issue\n                    try { await account.deploy(); } catch (e) {}\n                }"
);

fs.writeFileSync(file, code);
console.log("Patched deploy");
