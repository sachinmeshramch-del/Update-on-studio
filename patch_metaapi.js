const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

const patch = `
// Intercept and suppress noisy MetaApi SDK background timeout errors
const originalConsoleError = console.error;
console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Error refreshing market data subscriptions job')) {
        // Suppress harmless background timeout error when broker is disconnected
        return;
    }
    originalConsoleError(...args);
};
`;

if (!code.includes('originalConsoleError')) {
  // insert after imports
  const importEnd = code.lastIndexOf('import ');
  const insertPos = code.indexOf('\n', importEnd) + 1;
  code = code.slice(0, insertPos) + '\n' + patch + '\n' + code.slice(insertPos);
  fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
}
