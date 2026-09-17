const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let code = fs.readFileSync(file, 'utf8');

const target1 = `      // 2. Demo Account Execution (Concurrent)
      const isDemoAuto = Boolean(settings.autoTradingDemoEnabled || (settings.autoTradingEnabled && settings.tradingMode === "DEMO"));
      isRealTrade = isRealAuto || isDemoAuto;
      if (isDemoAuto) {
        const demoId = settings.demoAccountId?.trim();
        if (demoId) {
          logger.info({ direction: signal.signal, entry: signal.entryPrice, sl: signal.stopLoss, tp: signal.takeProfit, accountId: demoId }, "[MetaApi Execution] Dispatching trade to DEMO MT5 account concurrently...");
          tradePromises.push(
            executeTradeWithCapitalManagement(demoId, "DEMO", signal.signal, signal.stopLoss, signal.takeProfit, signal.entryPrice, settings, signalDetectedAt)
              .catch((demoErr: any) => logger.error({ err: demoErr?.message || demoErr, accountId: demoId }, "[MetaApi Execution] DEMO trade execution failed"))
          );
        } else {
          logger.warn("[MetaApi Execution] Auto-trading (Demo) is ON, but Demo Account ID is not configured in settings.");
        }
      }`;

const replace1 = `      isRealTrade = isRealAuto;`;

code = code.replace(target1, replace1);

const targetIsRealAuto = `      const isRealAuto = Boolean(settings.autoTradingRealEnabled || (settings.autoTradingEnabled && settings.tradingMode === "REAL"));`;
const replaceIsRealAuto = `      const isRealAuto = Boolean(settings.autoTradingRealEnabled || settings.autoTradingEnabled);`;
code = code.replace(targetIsRealAuto, replaceIsRealAuto);

fs.writeFileSync(file, code);
