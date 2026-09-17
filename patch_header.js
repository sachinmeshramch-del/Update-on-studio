const fs = require('fs');
const file = 'artifacts/gold-swing-ai/src/components/layout/header.tsx';
let code = fs.readFileSync(file, 'utf8');

const target1 = `    tradingMode: "DEMO" | "REAL";
    demoAccountId: string;
    realAccountId: string;`;
const replace1 = `    tradingMode: "REAL";
    realAccountId: string;`;
code = code.replace(target1, replace1);

const target2 = `  const isDemo = settings?.tradingMode === "DEMO";`;
const replace2 = `  const isDemo = false;`;
code = code.replace(target2, replace2);

fs.writeFileSync(file, code);
