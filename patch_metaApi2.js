const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

// Suppress console.error from SDK for this specific timeout
if (!content.includes('originalError = console.error')) {
    content = content.replace('const originalWarn = console.warn;', 
`const originalError = console.error;
console.error = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('not connected to broker yet')) {
        return; // Suppress SDK internal log
    }
    originalError.apply(console, args);
};
const originalWarn = console.warn;`);
}

content = content.replace(
    `        if (err.name === 'ValidationError' && err.message.includes('symbol does not exist')) {
            logger.error({ err }, "MetaApi Feed error: The symbol '" + SYMBOL + "' does not exist on your broker. Please update META_API_SYMBOL in your settings.");
            // Do not aggressively reconnect if the symbol is fundamentally wrong
            reconnectDelay = 300000; // Try again in 5 minutes
        } else {
            logger.error({ err }, "MetaApi Feed error");
        }`,
    `        if (err.name === 'ValidationError' && err.message.includes('symbol does not exist')) {
            logger.warn("MetaApi Feed error: The symbol '" + SYMBOL + "' does not exist on your broker. Please update META_API_SYMBOL.");
            reconnectDelay = 300000;
        } else if (err.message && err.message.includes('not connected to broker yet')) {
            logger.warn("MetaApi account is not connected to broker yet. Waiting for broker connection...");
            reconnectDelay = 60000; // 1 minute backoff to reduce log spam
        } else {
            logger.error({ err }, "MetaApi Feed error");
        }`
);

fs.writeFileSync(file, content);
console.log("Patched metaApiFeed.ts");
