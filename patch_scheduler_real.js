const fs = require("fs");
const file = "artifacts/api-server/src/lib/signalScheduler.ts";
let code = fs.readFileSync(file, "utf8");

// We need to inject isRealTrade logic
if (!code.includes("const isRealTrade = isRealAuto || isDemoAuto;")) {
    code = code.replace(
        "const isDemoAuto = Boolean(settings.autoTradingEnabled && settings.tradingMode === \"DEMO\");",
        "const isDemoAuto = Boolean(settings.autoTradingEnabled && settings.tradingMode === \"DEMO\");\n      const isRealTrade = isRealAuto || isDemoAuto;"
    );
    
    code = code.replace(
        "candleScore: null",
        "candleScore: null,\n      isRealTrade: isRealTrade"
    );
    fs.writeFileSync(file, code);
    console.log("Patched signalScheduler.ts");
} else {
    console.log("Already patched signalScheduler.ts");
}
