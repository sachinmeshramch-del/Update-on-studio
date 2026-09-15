const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// The fixed thresholds (5.0 and 6.0) are too small for large intraday swings, especially when Gold ATR is high.
// Let's replace them with a dynamic multiplier based on ATR.

code = code.replace(/> 6\.0\)/g, '> Math.max(atr * 0.8, 10.0))');
code = code.replace(/>6\.0 pts/g, '> ATR*0.8');

code = code.replace(/> 5\.0\)/g, '> Math.max(atr * 0.6, 8.0))');
code = code.replace(/>5\.0 pts/g, '> ATR*0.6');

fs.writeFileSync(file, code);
console.log("Updated overextension logic to scale with ATR.");
