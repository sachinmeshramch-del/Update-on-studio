const fs = require('fs');
const file = 'artifacts/api-server/src/lib/tradeTracker.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/peakProfit >= 5\.0 && peakProfit < 9\.0/g, 'peakProfit >= 10.0 && peakProfit < 20.0');
code = code.replace(/3\.50\)\.toFixed/g, '6.00).toFixed');

code = code.replace(/peakProfit >= 9\.0 && peakProfit < 15\.0/g, 'peakProfit >= 20.0 && peakProfit < 35.0');
code = code.replace(/4\.50\)\.toFixed/g, '9.00).toFixed');

code = code.replace(/peakProfit >= 15\.0/g, 'peakProfit >= 35.0');
code = code.replace(/5\.50\)\.toFixed/g, '15.00).toFixed');

// The same for minLockedProfit
code = code.replace(/Math\.max\(2\.50,/g, 'Math.max(5.00,');

fs.writeFileSync(file, code);
