const fs = require('fs');
const pathHistory = './artifacts/gold-swing-ai/src/components/trading/history-table.tsx';
let historyCode = fs.readFileSync(pathHistory, 'utf8');

historyCode = historyCode.replace(/if \(type === "HEDGE"\) return \([\s\S]*?HEDGE[\s\S]*?<\/span>\s*\);\s*/, '');
// And remove ShieldAlert import if it's there
historyCode = historyCode.replace('ShieldAlert, ', '');
historyCode = historyCode.replace(', ShieldAlert', '');

fs.writeFileSync(pathHistory, historyCode);

const pathSignalPanel = './artifacts/gold-swing-ai/src/components/trading/signal-panel.tsx';
let signalPanelCode = fs.readFileSync(pathSignalPanel, 'utf8');

signalPanelCode = signalPanelCode.replace(/\/\/ ── Hedge badge ─────────────────────────────────────────────────────────────[\s\S]*?function HedgeBadge\(\) \{[\s\S]*?<\/span>\s*\);\s*\}/, '');

signalPanelCode = signalPanelCode.replace(/\{signalType === "HEDGE" && <HedgeBadge \/>\}/, '');

fs.writeFileSync(pathSignalPanel, signalPanelCode);
console.log("Removed hedge UI components");
