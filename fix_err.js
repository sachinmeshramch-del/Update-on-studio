const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

code = code.replace(
`console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Error refreshing market data subscriptions job')) {
        // Suppress harmless background timeout error when broker is disconnected
        return;
    originalConsoleError(...args);
};`,
`console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Error refreshing market data subscriptions job')) {
        // Suppress harmless background timeout error when broker is disconnected
        return;
    }
    originalConsoleError(...args);
};`
);
code = code.replace(
`        a.includes('failed to restore sticky connection') || 
        a.includes('already running') ||
        a.includes('Cannot subscribe to market data for symbol') ||
        a.includes('websocket connection closed'))) {
        return;
    originalError(...args);
};`,
`        a.includes('failed to restore sticky connection') || 
        a.includes('already running') ||
        a.includes('Cannot subscribe to market data for symbol') ||
        a.includes('websocket connection closed'))) {
        return;
    }
    originalError(...args);
};`
);
fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
