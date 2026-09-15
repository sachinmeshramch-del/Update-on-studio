const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Cooldowns
code = code.replace(/COOLDOWN_MS\s*=\s*7_200_000;\s*\/\/\s*2 hours/g, 'COOLDOWN_MS             = 3_600_000;  // 1 hour');
code = code.replace(/MIN_SIGNAL_INTERVAL_MS\s*=\s*30 \* 60_000;/g, 'MIN_SIGNAL_INTERVAL_MS  = 15 * 60_000;');

// 2. Macro Overextension blocks (2.5 and 3.0 are too tight for Gold intraday)
code = code.replace(/> 3\.0\)/g, '> 6.0)');
code = code.replace(/>3\.0 pts/g, '>6.0 pts');

code = code.replace(/> 2\.5\)/g, '> 5.0)');
code = code.replace(/>2\.5 pts/g, '>5.0 pts');

// 3. Volatility Filter
code = code.replace(/VOLATILITY_THRESHOLD = 0\.60;/g, 'VOLATILITY_THRESHOLD = 0.40;');

fs.writeFileSync(file, code);
console.log("Loosened overly strict macro gates and cooldowns.");
