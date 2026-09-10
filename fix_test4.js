const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');
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
};`);
fs.writeFileSync('test.ts', code);
