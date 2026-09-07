const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/signalScheduler.ts', 'utf8');

code = code.replace(
  'import { insertSignal, getLatestSignal, getRunningTrades } from "@workspace/db";',
  'import { insertSignal, getLatestSignal, getRunningTrades, updateTradeStatus } from "@workspace/db";'
);

code = code.replace(
  'import { getMetaApiStatus, executeTradeOnAccount } from "./metaApiFeed.js";',
  'import { getMetaApiStatus, executeTradeOnAccount, closeAllPositions } from "./metaApiFeed.js";'
);

const rolloverCode = `
let isRolloverClosing = false;
let rolloverClosedDate = "";

async function checkDailyRolloverAndClose(): Promise<void> {
    if (isRolloverClosing) return;
    isRolloverClosing = true;
    try {
        const now = new Date();
        const nyFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            hour12: false,
            hour: "numeric",
            minute: "numeric",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            weekday: "short"
        });
        const parts = nyFormatter.formatToParts(now);
        let nyHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
        if (nyHour === 24) nyHour = 0;
        const nyMin = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
        const nyDayStr = parts.find(p => p.type === 'weekday')?.value;
        const currentDateKey = \`\${parts.find(p => p.type === 'year')?.value}-\${parts.find(p => p.type === 'month')?.value}-\${parts.find(p => p.type === 'day')?.value}\`;

        // 15 minutes before 5 PM NY time = 16:45 NY time
        // Weekend close check: Friday at 16:45. Daily check: Mon-Thu at 16:45
        if (nyHour === 16 && nyMin >= 45 && nyDayStr !== 'Sat' && nyDayStr !== 'Sun') {
            if (rolloverClosedDate !== currentDateKey) {
                logger.info("[Rollover Check] Approaching daily/weekend rollover. Auto-closing all open positions.");
                const settings = await getSystemSettings();
                
                if (settings.autoTradingDemoEnabled && settings.demoAccountId) {
                    await closeAllPositions(settings.demoAccountId);
                }
                if (settings.autoTradingRealEnabled && settings.realAccountId) {
                    await closeAllPositions(settings.realAccountId);
                }
                
                // Mark running trades in DB as closed
                const running = await getRunningTrades();
                const currentPrice = getLatestPrice()?.price || 0;
                for (const trade of running) {
                    if (trade.id) {
                        await updateTradeStatus(trade.id, "CLOSED", currentPrice, 0);
                        logger.info({ tradeId: trade.id }, "Marked trade as CLOSED due to rollover");
                    }
                }

                rolloverClosedDate = currentDateKey;
            }
        }
    } catch (e: any) {
        logger.error({ err: e.message || e }, "Rollover check failed");
    } finally {
        isRolloverClosing = false;
    }
}
`;

code = code.replace(
  'let isScheduling = false;',
  'let isScheduling = false;\n' + rolloverCode
);

code = code.replace(
  'async function runScheduledSignal(): Promise<void> {\n  if (isScheduling) return;\n  isScheduling = true;\n  try {\n    const live  = getLatestPrice();',
  'async function runScheduledSignal(): Promise<void> {\n  if (isScheduling) return;\n  isScheduling = true;\n  try {\n    await checkDailyRolloverAndClose();\n\n    const live  = getLatestPrice();'
);

fs.writeFileSync('artifacts/api-server/src/lib/signalScheduler.ts', code);
