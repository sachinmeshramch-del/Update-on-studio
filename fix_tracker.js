const fs = require("fs");
const file = "artifacts/api-server/src/lib/tradeTracker.ts";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
    "if (!matchingOpenPos && currentAsk >= stopLoss) {",
    "if (!matchingOpenPos && !trade.isRealTrade && currentAsk >= stopLoss) {"
);

code = code.replace(
    "if (!matchingOpenPos && currentAsk <= trade.takeProfit) {",
    "if (!matchingOpenPos && !trade.isRealTrade && currentAsk <= trade.takeProfit) {"
);

code = code.replace(
    "if (!matchingOpenPos && currentBid <= stopLoss) {",
    "if (!matchingOpenPos && !trade.isRealTrade && currentBid <= stopLoss) {"
);

code = code.replace(
    "if (!matchingOpenPos && currentBid >= trade.takeProfit) {",
    "if (!matchingOpenPos && !trade.isRealTrade && currentBid >= trade.takeProfit) {"
);

fs.writeFileSync(file, code);
