const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/candlesPrimary = await fetchWithFallback\("4h", 300\);/g, 'candlesPrimary = await fetchWithFallback("5m", 300);');
code = code.replace(/candlesEntry = await fetchWithFallback\("5m", 300\);/g, 'candlesEntry = await fetchWithFallback("1m", 300);');
code = code.replace(/candlesMacro = await fetchWithFallback\("4h", 100\);/g, 'candlesMacro = await fetchWithFallback("15m", 100);');
code = code.replace(/candlesHTF = await fetchWithFallback\("4h", 100\);/g, 'candlesHTF = await fetchWithFallback("1h", 100);');

// The synthetic logic:
// candlesMacro synthesis: from 5m (candlesPrimary), length 4 ? Wait, 15m is 3 * 5m.
// 1h is 12 * 5m. But the existing code says i+=4 and i+=16. 
// If primary is 5m, then 15m is i+=3, 1h is i+=12.
code = code.replace(/i \+= 4/g, 'i += 3');
code = code.replace(/i \+ 4/g, 'i + 3');
code = code.replace(/i \+= 16/g, 'i += 12');
code = code.replace(/i \+ 16/g, 'i + 12');

fs.writeFileSync(file, code);
