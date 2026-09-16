const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    const hardFloorActive = sinceLastSignal < MIN_SIGNAL_INTERVAL_MS;`;
const replace = `    let hardFloorActive = sinceLastSignal < MIN_SIGNAL_INTERVAL_MS;
    if (disableCooldowns) hardFloorActive = false;`;

if (code.includes(target) && !code.includes('if (disableCooldowns) hardFloorActive = false')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
