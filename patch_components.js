const fs = require('fs');

function replaceFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/bg-\[#131722\]\/80/g, 'bg-background/80');
  content = content.replace(/bg-\[#131722\]/g, 'bg-background');
  content = content.replace(/bg-\[#0f1724\]/g, 'bg-popover');
  content = content.replace(/border-white\/10/g, 'border-border');
  content = content.replace(/border-white\/5/g, 'border-border');
  content = content.replace(/border-white\/8/g, 'border-border');
  fs.writeFileSync(file, content);
}

replaceFile('artifacts/gold-swing-ai/src/components/trading/live-tick-chart.tsx');
replaceFile('artifacts/gold-swing-ai/src/components/trading/chart-widget.tsx');
replaceFile('artifacts/gold-swing-ai/src/components/trading/history-table.tsx');
replaceFile('artifacts/gold-swing-ai/src/components/trading/signal-panel.tsx');
replaceFile('artifacts/gold-swing-ai/src/components/trading/analytics-panel.tsx');
replaceFile('artifacts/gold-swing-ai/src/components/trading/MarketAnalysis.tsx');
replaceFile('artifacts/gold-swing-ai/src/components/trading/indicators-row.tsx');

console.log("Patched component colors");
