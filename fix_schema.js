const fs = require('fs');
let file = 'lib/db/src/schema/settings.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('disableCooldowns?: boolean;')) {
    code = code.replace('dashboardPasscode?: string;', 'dashboardPasscode?: string;\n  disableCooldowns?: boolean;');
    fs.writeFileSync(file, code);
}

file = 'lib/db/src/dao.ts';
code = fs.readFileSync(file, 'utf8');
if (!code.includes('disableCooldowns: false,')) {
    code = code.replace(`tradingMode: 'DEMO',`, `tradingMode: 'DEMO',\n      disableCooldowns: false,`);
    fs.writeFileSync(file, code);
}
