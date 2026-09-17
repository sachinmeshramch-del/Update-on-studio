const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let code = fs.readFileSync(file, 'utf8');

const target1 = `                if (settings.autoTradingDemoEnabled && settings.demoAccountId) {
                    await closeAllPositions(settings.demoAccountId);
                }`;
code = code.replace(target1, '');

const target2 = `        const demoId = settings.demoAccountId?.trim();
        const realId = settings.realAccountId?.trim();
        const mode = settings.tradingMode || "DEMO";

        let targetAccountId = mode === "REAL" ? realId : demoId;

        // Fallback safely if requested account is missing
        if (!targetAccountId) {
            targetAccountId = demoId || realId;
        }

        if (!targetAccountId) {
            throw new Error("No MetaApi Account ID configured in Settings");
        }`;

const replace2 = `        const realId = settings.realAccountId?.trim();
        let targetAccountId = realId;

        if (!targetAccountId) {
            throw new Error("No MetaApi Real Account ID configured in Settings");
        }`;
code = code.replace(target2, replace2);


const target3 = `        if (mode === "DEMO" && !settings.autoTradingDemoEnabled) {
            logger.info("Signal committed, but auto-trading (Demo) is disabled in settings. Skipping execution.");
            return;
        }
        
        if (mode === "REAL" && !settings.autoTradingRealEnabled) {
            logger.info("Signal committed, but auto-trading (Real) is disabled in settings. Skipping execution.");
            return;
        }`;

const replace3 = `        if (!settings.autoTradingRealEnabled) {
            logger.info("Signal committed, but auto-trading (Real) is disabled in settings. Skipping execution.");
            return;
        }`;
code = code.replace(target3, replace3);

fs.writeFileSync(file, code);
