const fs = require("fs");
const file = "artifacts/api-server/src/lib/signalScheduler.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
    "const isDemoAuto = Boolean(settings.autoTradingDemoEnabled || (settings.autoTradingEnabled && settings.tradingMode === \"DEMO\"));",
    "const isDemoAuto = Boolean(settings.autoTradingDemoEnabled || (settings.autoTradingEnabled && settings.tradingMode === \"DEMO\"));\n      const isRealTrade = isRealAuto || isDemoAuto;"
);

fs.writeFileSync(file, code);
