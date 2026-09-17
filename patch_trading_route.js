const fs = require('fs');
const file = 'artifacts/api-server/src/routes/trading.ts';
let code = fs.readFileSync(file, 'utf8');

// Import resetCooldownTimer
if (code.includes('import { getAnalyticsSummary, setSmartMode } from "../lib/performanceAnalytics.js";')) {
    code = code.replace(
        'import { getAnalyticsSummary, setSmartMode } from "../lib/performanceAnalytics.js";',
        'import { getAnalyticsSummary, setSmartMode } from "../lib/performanceAnalytics.js";\nimport { resetCooldownTimer } from "../lib/signalEngine.js";'
    );
}

// Call resetCooldownTimer in the close route
const target = `    await updateTradeStatus(id, "MANUALLY_CLOSED", currentPrice, Number(pnl.toFixed(2)));`;
const replace = `    await updateTradeStatus(id, "MANUALLY_CLOSED", currentPrice, Number(pnl.toFixed(2)));
    
    // Forcibly reset the bot's signal cooldown to prevent it from instantly jumping back into the market
    try {
        resetCooldownTimer();
    } catch (e) {
        req.log.warn({ e }, "Failed to reset cooldown timer");
    }`;

if (code.includes(target) && !code.includes('resetCooldownTimer();')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
