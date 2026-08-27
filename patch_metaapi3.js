const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `const originalError = console.error;
console.error = function (...args) {
    if (typeof args[0] === 'string' && (args[0].includes('not connected to broker yet') || args[0].includes('Failed to subscribe timeoutError_TimeoutError'))) {
        return; // Suppress SDK internal log
    }
    originalError.apply(console, args);
};`;

content = content.replace(/const originalError = console\.error;[\s\S]*?originalError\.apply\(console, args\);\n};/, replacement);

fs.writeFileSync(file, content);
console.log("Patched console.error in metaApiFeed.ts");
