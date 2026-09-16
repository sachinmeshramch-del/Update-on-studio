const fs = require('fs');
const fileAT = 'artifacts/api-server/src/lib/autoTrader.ts';
let codeAT = fs.readFileSync(fileAT, 'utf8');

const targetAT = `    try {
        const result = await executeTradeOnAccount(`;
const replaceAT = `    try {
        logger.info({
            event: "DIAGNOSTIC_BACKEND_EXECUTION",
            accountId: accountId,
            direction: direction,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            volume: calculatedVolume,
            entryPrice: entryPrice
        }, "=== BACKEND AUTOTRADER EXECUTION DIAGNOSTIC ===");
        
        const result = await executeTradeOnAccount(`;

if (codeAT.includes(targetAT) && !codeAT.includes('DIAGNOSTIC_BACKEND_EXECUTION')) {
    codeAT = codeAT.replace(targetAT, replaceAT);
    fs.writeFileSync(fileAT, codeAT);
}
