const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/routes/index.ts', 'utf8');

code = code.replace(
  'import settingsRouter from "./settings";',
  'import settingsRouter from "./settings";\nimport backtestRouter from "./backtest.js";'
);

code = code.replace(
  "router.use('/settings', settingsRouter);",
  "router.use('/settings', settingsRouter);\nrouter.use('/backtest', backtestRouter);"
);

fs.writeFileSync('./artifacts/api-server/src/routes/index.ts', code);
