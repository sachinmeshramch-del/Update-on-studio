const fs = require('fs');
const file = 'artifacts/api-server/src/lib/autoTrader.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'import { executeTradeOnAccount, getAccountEquity } from "./metaApiFeed.js";',
    'import { executeTradeOnAccount, getAccountFundsInfo } from "./metaApiFeed.js";'
);

const oldCalc = `    // Fetch live equity from MetaApi
    let actualEquity = await getAccountEquity(accountId);
    
    // Fallback if the connection failed
    if (!actualEquity || actualEquity <= 0) {
        logger.warn({ accountId }, "[AutoTrader] Could not fetch live equity, defaulting to $1000 fallback balance for safety.");
        actualEquity = 1000;
    }

    logger.info({ accountId, actualEquity, riskPerTrade }, \`[AutoTrader] Dynamically calculating risk based on live available funds...\`);`;

const newCalc = `    // Fetch live equity and leverage from MetaApi
    let fundsInfo = await getAccountFundsInfo(accountId);
    let actualEquity = fundsInfo ? fundsInfo.equity : null;
    let leverage = fundsInfo ? fundsInfo.leverage : 0;
    
    // Fallback if the connection failed
    if (!actualEquity || actualEquity <= 0) {
        logger.warn({ accountId }, "[AutoTrader] Could not fetch live equity, defaulting to $1000 fallback balance for safety.");
        actualEquity = 1000;
    }

    logger.info({ accountId, actualEquity, leverage, riskPerTrade }, \`[AutoTrader] Dynamically calculating risk based on live available funds (Leverage: 1:\${leverage})...\`);`;

content = content.replace(oldCalc, newCalc);
fs.writeFileSync(file, content);
console.log("Patched autoTrader.ts");
