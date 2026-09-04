const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/routes/backtest.ts', 'utf8');

code = code.replace(
  'router.post("/run", async (req, res) => {',
  'router.post("/run", async (req, res): Promise<any> => {'
);

fs.writeFileSync('./artifacts/api-server/src/routes/backtest.ts', code);
