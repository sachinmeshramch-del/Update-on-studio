const fs = require('fs');
const file = 'artifacts/api-server/src/lib/autoTrader.ts';
let code = fs.readFileSync(file, 'utf8');

const targetAuto = `    // Circuit Breaker Guard: Strictly block trade if in circuit breaker or directional cooldown
    try {
        const recentSignals = await getRecentSignals(25);`;

const replaceAuto = `    // Circuit Breaker Guard: Strictly block trade if in circuit breaker or directional cooldown
    try {
        const sysSettings = await getSystemSettings();
        if (sysSettings.disableCooldowns === true) {
            logger.info("[AutoTrader] Cooldowns disabled in settings, bypassing pre-execution circuit breaker.");
        } else {
        const recentSignals = await getRecentSignals(25);`;

if (code.includes(targetAuto) && !code.includes('sysSettings.disableCooldowns')) {
    code = code.replace(targetAuto, replaceAuto);
    code = code.replace(`        }
    } catch (cbErr) {
        logger.warn({ cbErr }, "[AutoTrader] Circuit breaker pre-check non-blocking error");
    }`, `        }
        }
    } catch (cbErr) {
        logger.warn({ cbErr }, "[AutoTrader] Circuit breaker pre-check non-blocking error");
    }`);
    fs.writeFileSync(file, code);
}
