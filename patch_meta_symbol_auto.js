const fs = require('fs');
let file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

// replace the subscription line
const target = `await connection.subscribeToMarketData(SYMBOL);\n        metaApiStatus = "connected";\n        logger.info(\`Successfully subscribed to MetaApi market data for \${SYMBOL}\`);`;

const replacement = `let subscribed = false;
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
        }

        if (!subscribed) {
            throw lastError;
        }

        metaApiStatus = "connected";
        logger.info(\`Successfully subscribed to MetaApi market data for \${SYMBOL}\`);`;

if (content.includes('await connection.subscribeToMarketData(SYMBOL);')) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content);
    console.log("Patched successfully");
} else {
    console.log("Could not find target string");
}
