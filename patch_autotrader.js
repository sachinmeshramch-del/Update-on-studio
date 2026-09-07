const fs = require('fs');
const file = 'artifacts/api-server/src/lib/autoTrader.ts';
let content = fs.readFileSync(file, 'utf8');

// replace the import
content = content.replace(
    'import { executeTradeOnAccount } from "./metaApiFeed.js";',
    'import { executeTradeOnAccount, getAccountEquity } from "./metaApiFeed.js";'
);

const targetCalculation = `    // In a real scenario, we would fetch live equity from MetaApi:
    // const info = await connection.getAccountInformation();
    // const equity = info.equity;
    // For this demonstration, we'll assume a $1000 standard balance if we can't fetch it dynamically here without the connection object directly exposed.
    // To keep it simple without breaking the existing metaApiFeed.ts state, we'll calculate a standard lot size based on fixed equity unless we fetch it.
    
    const assumedEquity = 1000; 
    // Risk amount = Equity * Risk%
    const riskAmount = assumedEquity * (riskPerTrade / 100);`;

const newCalculation = `    // Fetch live equity from MetaApi
    let actualEquity = await getAccountEquity(accountId);
    
    // Fallback if the connection failed
    if (!actualEquity || actualEquity <= 0) {
        logger.warn({ accountId }, "[AutoTrader] Could not fetch live equity, defaulting to $1000 fallback balance for safety.");
        actualEquity = 1000;
    }

    logger.info({ accountId, actualEquity, riskPerTrade }, \`[AutoTrader] Dynamically calculating risk based on live available funds...\`);

    // Risk amount = Equity * Risk%
    const riskAmount = actualEquity * (riskPerTrade / 100);`;

content = content.replace(targetCalculation, newCalculation);

fs.writeFileSync(file, content);
console.log("Patched autoTrader.ts");
