const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    '        metaApiStatus = "disconnected";\n        logger.error({ err }, "MetaApi Feed error");\n        scheduleReconnect();',
    `        metaApiStatus = "disconnected";
        if (err.name === 'ValidationError' && err.message.includes('symbol does not exist')) {
            logger.error({ err }, "MetaApi Feed error: The symbol '" + SYMBOL + "' does not exist on your broker. Please update META_API_SYMBOL in your settings.");
            // Do not aggressively reconnect if the symbol is fundamentally wrong
            reconnectDelay = 300000; // Try again in 5 minutes
        } else {
            logger.error({ err }, "MetaApi Feed error");
        }
        scheduleReconnect();`
);

fs.writeFileSync(file, content);
console.log("Patched metaApiFeed.ts");
