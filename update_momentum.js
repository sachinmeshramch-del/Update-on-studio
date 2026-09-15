const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// The ADX threshold of 35 is too high for this specific Gold market state.
// We will lower the Extreme Momentum trigger to ADX > 25 (which is the standard definition of a "strong trend").

code = code.replace(/const isExtremeMomentum = currentAdx > 35;/g, 'const isExtremeMomentum = currentAdx > 25;');
code = code.replace(/\(ADX < 35\)/g, '(ADX < 25)');

fs.writeFileSync(file, code);
