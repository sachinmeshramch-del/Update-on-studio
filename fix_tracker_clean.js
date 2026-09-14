const fs = require("fs");
const file = "artifacts/api-server/src/lib/tradeTracker.ts";
let code = fs.readFileSync(file, "utf8");

// Restore the wrongly replaced logger.debug else blocks
code = code.replace(
    /} else if \(\!trade\.isRealTrade\) \{\n                    logger\.debug\(/g,
    "} else {\n                    logger.debug("
);

// We need to keep the `} else if (!trade.isRealTrade) {` for the paper trade DB update block
// This is exactly before `trade.stopLoss = targetSl;`
// Let's verify it's correct.

fs.writeFileSync(file, code);
