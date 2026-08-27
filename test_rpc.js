const fs = require('fs');
let content = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

const oldLoop = `        let subscribed = false;
        let lastError = null;
        const candidates = [SYMBOL, "XAUUSD", "GOLD", "XAUUSDm", "XAUUSD.a", "XAUUSD#", "GOLDm", "XAUUSD_micro", "GOLDmicro", "XAUUSD.", "XAUUSDc", "XAUUSDb"];
        const symbolsToTry = Array.from(new Set(candidates));

        for (const sym of symbolsToTry) {
            try {
                await connection.subscribeToMarketData(sym);
                SYMBOL = sym; 
                subscribed = true;
                break;
            } catch (e: any) {
                lastError = e;
                if (e.name === 'ValidationError' && e.message && e.message.includes('symbol does not exist')) {
                    continue;
                } else {
                    throw e;
                }
            }
        }`;

const newLoop = `        let subscribed = false;
        let lastError = null;
        const candidates = [SYMBOL, "XAUUSD", "GOLD", "XAUUSDm", "XAUUSD.a", "XAUUSD#", "GOLDm", "XAUUSD_micro", "GOLDmicro", "XAUUSD.", "XAUUSDc", "XAUUSDb"];
        let symbolsToTry = Array.from(new Set(candidates));

        // Attempt to fetch all available broker symbols dynamically to find the correct Gold symbol if possible
        try {
            const rpc = await account.getRPC();
            const allSymbols = await rpc.getSymbols();
            if (allSymbols && allSymbols.length > 0) {
                const goldSymbols = allSymbols.filter((s: string) => s.toUpperCase().includes("XAU") || s.toUpperCase().includes("GOLD"));
                if (goldSymbols.length > 0) {
                    symbolsToTry = [SYMBOL, ...goldSymbols, ...symbolsToTry];
                    symbolsToTry = Array.from(new Set(symbolsToTry));
                    logger.info("Found gold-related symbols on broker: " + goldSymbols.join(", "));
                }
            }
        } catch (rpcErr) {
            logger.debug({err: rpcErr}, "Could not fetch symbols via RPC");
        }

        for (const sym of symbolsToTry) {
            try {
                await connection.subscribeToMarketData(sym);
                SYMBOL = sym; 
                subscribed = true;
                break;
            } catch (e: any) {
                lastError = e;
                if (e.name === 'ValidationError' && e.message && e.message.includes('symbol does not exist')) {
                    continue;
                } else {
                    throw e;
                }
            }
        }`;

content = content.replace(oldLoop, newLoop);
fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', content);
