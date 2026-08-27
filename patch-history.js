const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/trading/history-table.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'const start = new Date(timestamp);',
  'const start = timestamp ? new Date(timestamp) : new Date();'
);

code = code.replace(
  '? allSignals.filter(s => new Date(s.timestamp) >= cutoff)',
  '? allSignals.filter(s => s.timestamp && new Date(s.timestamp) >= cutoff)'
);

fs.writeFileSync(file, code);
