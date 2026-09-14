const fs = require("fs");
const file = "artifacts/api-server/src/lib/tradeTracker.ts";
let code = fs.readFileSync(file, "utf8");

// We need to carefully replace `} else {` that is followed by `trade.stopLoss = targetSl;`
code = code.replace(
    "} else {\n              trade.stopLoss = targetSl;\n              trackerState.lastTargetSl = targetSl;",
    "} else if (!trade.isRealTrade) {\n              trade.stopLoss = targetSl;\n              trackerState.lastTargetSl = targetSl;"
);

// We should do it globally just in case.
const parts = code.split("} else {");
let newCode = parts[0];
for (let i = 1; i < parts.length; i++) {
    if (parts[i].includes("Updated Runner SL/TP in DB (paper trade)")) {
        newCode += "} else if (!trade.isRealTrade) {" + parts[i];
    } else {
        newCode += "} else {" + parts[i];
    }
}
code = newCode;

fs.writeFileSync(file, code);
