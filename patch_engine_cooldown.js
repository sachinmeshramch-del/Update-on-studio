const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// Remove disableCooldowns definition
code = code.replace(
  `  const sysSettings = await getSystemSettings();\n  const disableCooldowns = sysSettings.disableCooldowns === true;`,
  ``
);

// Decrease cooldown timings
code = code.replace(/const COOLDOWN_MS\s*=\s*3_600_000;/g, 'const COOLDOWN_MS             = 900_000;  // 15 mins');
code = code.replace(/const MIN_SIGNAL_INTERVAL_MS\s*=\s*15 \* 60_000;/g, 'const MIN_SIGNAL_INTERVAL_MS  = 5 * 60_000; // 5-min hard floor');
code = code.replace(/const SPIKE_COOLDOWN_COUNT = 2;/g, 'const SPIKE_COOLDOWN_COUNT = 1;');

// Remove bypasses
code = code.replace(/    if \(disableCooldowns\) inSpikeCooldown = false;\n/g, '');
code = code.replace(/    if \(disableCooldowns\) hardFloorActive = false;\n/g, '');
code = code.replace(/    if \(disableCooldowns\) inCooldown = false;\n/g, '');

code = code.replace(/inCircuitBreakerCooldown && !disableCooldowns/g, 'inCircuitBreakerCooldown');
code = code.replace(/longDirectionCooldown && !disableCooldowns/g, 'longDirectionCooldown');
code = code.replace(/shortDirectionCooldown && !disableCooldowns/g, 'shortDirectionCooldown');

fs.writeFileSync(file, code);
