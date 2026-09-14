const fs = require("fs");
const file = "artifacts/api-server/src/lib/signalScheduler.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
    "function handleLivePriceTick(live: LivePrice): void {",
    "let debugTickCount = 0;\nfunction handleLivePriceTick(live: LivePrice): void {\n  debugTickCount++;\n  if (debugTickCount % 50 === 0) logger.info({ price: live.price }, \"[DEBUG] Received 50 live ticks\");"
);

fs.writeFileSync(file, code);
