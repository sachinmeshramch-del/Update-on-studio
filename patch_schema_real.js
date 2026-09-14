const fs = require("fs");
const file = "lib/db/src/schema/signals.ts";
let code = fs.readFileSync(file, "utf8");
if (!code.includes("isRealTrade")) {
    code = code.replace("candleScore: number | null;", "candleScore: number | null;\n  isRealTrade?: boolean | null;\n  brokerPositionId?: string | null;");
    fs.writeFileSync(file, code);
    console.log("Patched schema");
} else {
    console.log("Already patched schema");
}
