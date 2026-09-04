const fs = require('fs');
let code = fs.readFileSync('artifacts/gold-swing-ai/src/pages/backtest.tsx', 'utf8');

// Safeguard projectedMonthlyPnl
code = code.replace(
  '{results.projectedMonthlyPnl >= 0 ? "+" : ""}\\${`${results.projectedMonthlyPnl.toFixed(2)}`}',
  '{results.projectedMonthlyPnl >= 0 ? "+" : ""}\\${`${(results.projectedMonthlyPnl || 0).toFixed(2)}`}'
);
code = code.replace(
  '{results.projectedMonthlyPnl >= 0 ? "text-green-500" : "text-red-500"}',
  '{(results.projectedMonthlyPnl || 0) >= 0 ? "text-green-500" : "text-red-500"}'
);

fs.writeFileSync('artifacts/gold-swing-ai/src/pages/backtest.tsx', code);
