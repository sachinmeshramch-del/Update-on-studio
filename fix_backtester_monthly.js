const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/backtester.ts', 'utf8');

// Insert calculations before the return
const calcCode = `
  const firstCandleTime = candles.length > 0 ? candles[0].time : 0;
  const lastCandleTime = candles.length > 0 ? candles[candles.length - 1].time : 0;
  const durationDays = (lastCandleTime - firstCandleTime) / (60 * 60 * 24);
  const projectedMonthlyPnl = durationDays > 0 ? (currentBalance - balance) * (30 / durationDays) : 0;

  return {`;

code = code.replace('  return {', calcCode);

// Insert the properties in the return object
code = code.replace(
  '    totalTrades: trades.length,',
  '    projectedMonthlyPnl,\n    durationDays,\n    totalTrades: trades.length,'
);

fs.writeFileSync('artifacts/api-server/src/lib/backtester.ts', code);
