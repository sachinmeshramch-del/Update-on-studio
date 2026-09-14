const fs = require('fs');
const files = [
  'artifacts/gold-swing-ai/src/components/trading/signal-panel.tsx',
  'artifacts/gold-swing-ai/src/components/trading/history-table.tsx',
  'artifacts/gold-swing-ai/src/components/layout/header.tsx',
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  
  code = code.replace(/Gold Scalp AI/g, 'Gold Intraday AI');
  code = code.replace(/Scalp Signal/g, 'Intraday Signal');
  code = code.replace(/scalp signal/g, 'intraday signal');
  code = code.replace(/Scalp – Today's/g, 'Intraday – Today\'s');
  code = code.replace(/5m\/1m/g, '1h/15m');
  
  fs.writeFileSync(file, code);
}
