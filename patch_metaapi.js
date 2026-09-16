const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    if (connection && activeAccountId === targetAccountId) {
        try {
            executionResult = direction === "LONG"`;
const replace = `    if (connection && activeAccountId === targetAccountId) {
        try {
            logger.info({
                event: "DIAGNOSTIC_MT5_DISPATCH",
                direction: direction,
                buyAction: direction === "LONG" ? "createMarketBuyOrder" : "createMarketSellOrder"
            }, "=== BACKEND MT5 DISPATCH DIAGNOSTIC ===");
            executionResult = direction === "LONG"`;

if (code.includes(target) && !code.includes('DIAGNOSTIC_MT5_DISPATCH')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
