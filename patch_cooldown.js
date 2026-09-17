const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `export function commitSignal(signal: SignalResult) {`;
const replace = `export function resetCooldownTimer() {
    lastSignalTime = Date.now();
    logger.info("Signal cooldown timer forcibly reset.");
}

export function commitSignal(signal: SignalResult) {`;

if (code.includes(target) && !code.includes('resetCooldownTimer')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
