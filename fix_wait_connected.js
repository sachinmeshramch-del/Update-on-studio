const fs = require("fs");
const file = "artifacts/api-server/src/lib/metaApiFeed.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
    /try \{\n\s+await account\.waitConnected\(60\);\n\s+\} catch\(waitErr: any\) \{\n\s+logger\.warn\(\{ accountId, err: waitErr\?\.message \}, "waitConnected warning\/timeout, continuing\.\.\."\);\n\s+\}/g,
    "try {\n                    await account.waitConnected(120);\n                } catch(waitErr: any) {\n                    logger.warn({ accountId, err: waitErr?.message }, \"waitConnected timed out, cannot subscribe to market data yet.\");\n                    continue;\n                }"
);

fs.writeFileSync(file, code);
console.log("Patched waitConnected");
