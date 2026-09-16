const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'import { getMetaApiStatus, executeTradeOnAccount, closeAllPositions } from "./metaApiFeed.js";',
  'import { getMetaApiStatus, executeTradeOnAccount, closeAllPositions, getOpenBrokerPositions } from "./metaApiFeed.js";'
);

const checkCode = `      const running = await getRunningTrades();
      if (running.length > 0) {
        logger.info({ runningCount: running.length, newSignal: signal.signal }, "Scheduler: Suppressing signal (a trade is already active)");
        return;
      }`;

const newCheckCode = `      const running = await getRunningTrades();
      const brokerOpen = await getOpenBrokerPositions().catch(() => []);
      
      if (running.length > 0 || brokerOpen.length > 0) {
        logger.info({ dbRunning: running.length, brokerRunning: brokerOpen.length, newSignal: signal.signal }, "Scheduler: Suppressing signal (a trade is already active either in DB or MT5)");
        return;
      }`;

code = code.replace(checkCode, newCheckCode);

fs.writeFileSync(file, code);
