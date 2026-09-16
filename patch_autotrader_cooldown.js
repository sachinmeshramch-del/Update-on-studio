const fs = require('fs');
const file = 'artifacts/api-server/src/lib/autoTrader.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    // Circuit Breaker Guard: Strictly block trade if in circuit breaker or directional cooldown
    try {
        const sysSettings = await getSystemSettings();
        if (sysSettings.disableCooldowns === true) {
            logger.info("[AutoTrader] Cooldowns disabled in settings, bypassing pre-execution circuit breaker.");
        } else {
        const recentSignals = await getRecentSignals(25);`;

const replace = `    // Circuit Breaker Guard: Strictly block trade if in circuit breaker or directional cooldown
    try {
        const recentSignals = await getRecentSignals(25);`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    
    // Also remove the extra closing brace that was added
    const targetEnd = `        }
        }
    } catch (cbErr) {`;
    const replaceEnd = `        }
    } catch (cbErr) {`;
    code = code.replace(targetEnd, replaceEnd);
    
    fs.writeFileSync(file, code);
}
