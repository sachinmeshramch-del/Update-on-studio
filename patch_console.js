const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const patchCode = `
// Suppress noisy SDK internal transport warnings that do not affect functionality
const originalWarn = console.warn;
console.warn = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('lost connection')) {
        if (args[1] instanceof Error && (args[1].message.includes('xhr post error') || args[1].message.includes('xhr poll error'))) {
            return; // Suppress
        }
    }
    if (typeof args[0] === 'string' && args[0].includes('failed to connect')) {
        if (args[1] instanceof Error && (args[1].message.includes('xhr post error') || args[1].message.includes('xhr poll error'))) {
            return; // Suppress
        }
    }
    originalWarn.apply(console, args);
};
`;

if (!content.includes('originalWarn = console.warn')) {
    // Insert after imports
    const lines = content.split('\n');
    let importEnd = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) {
            importEnd = i;
        }
    }
    lines.splice(importEnd + 1, 0, patchCode);
    fs.writeFileSync(file, lines.join('\n'));
    console.log("Patched metaApiFeed.ts to suppress SDK logs");
}
