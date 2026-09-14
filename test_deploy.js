const fs = require("fs");
const file = "artifacts/api-server/src/lib/metaApiFeed.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
    "try { await account.deploy(); } catch (e) {}",
    "try { await account.deploy(); } catch (e) { console.error(\"[MetaApi] Forced deploy failed:\", e?.message || e); }"
);

fs.writeFileSync(file, code);
