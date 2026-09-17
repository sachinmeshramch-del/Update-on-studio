const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/settings-dialog.tsx';
let code = fs.readFileSync(file, 'utf8');

// Remove demoAccountId and autoTradingDemoEnabled from Settings interface
code = code.replace(/tradingMode: "DEMO" \| "REAL";/, 'tradingMode?: "REAL";');
code = code.replace(/demoAccountId: string;/, '');
code = code.replace(/autoTradingDemoEnabled: boolean;/, '');

// Remove from initial state
code = code.replace(/tradingMode: "DEMO",/, 'tradingMode: "REAL",');
code = code.replace(/demoAccountId: "",/, '');
code = code.replace(/autoTradingDemoEnabled: false,/, '');

// Remove handleToggle signature
code = code.replace(/key: "autoTradingDemoEnabled" \| "autoTradingRealEnabled"/, 'key: "autoTradingRealEnabled"');

// Replace handleModeChange to avoid setting DEMO
code = code.replace(/const handleModeChange = \(mode: "DEMO" \| "REAL"\) => \{/, 'const handleModeChange = (mode: "REAL") => {');

// We need to carefully remove the blocks for Demo from the UI

fs.writeFileSync(file, code);
