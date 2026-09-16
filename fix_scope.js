const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'const tradePromises: Promise<any>[] = [];',
  'const tradePromises: Promise<any>[] = [];\n    let isRealTrade = false;'
);

code = code.replace(
  'const isRealTrade = isRealAuto || isDemoAuto;',
  'isRealTrade = isRealAuto || isDemoAuto;'
);

fs.writeFileSync(file, code);
