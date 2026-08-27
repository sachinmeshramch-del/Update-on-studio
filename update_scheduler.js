const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/lib/signalScheduler.ts', 'utf8');

content = content.replace(
  `      if (settings.autoTradingEnabled) {`,
  `      const isAutoTradingEnabled = settings.tradingMode === 'DEMO' ? settings.autoTradingDemoEnabled : settings.autoTradingRealEnabled;
      if (isAutoTradingEnabled || settings.autoTradingEnabled) {`
);

fs.writeFileSync('artifacts/api-server/src/lib/signalScheduler.ts', content);
