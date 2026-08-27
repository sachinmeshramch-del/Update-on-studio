const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `// Suppress noisy SDK internal transport warnings that do not affect functionality
const originalError = console.error;
console.error = function (...args) {
    if (args.some(a => typeof a === 'string' && (a.includes('not connected to broker yet') || a.includes('timeoutError_TimeoutError') || a.includes('Socket does not have mapped wrapper') || a.includes('xhr poll error') || a.includes('failed to restore sticky connection') || a.includes('@firebase/firestore') || a.includes('ECONNRESET')))) {
        return;
    }
    if (args.some(a => a instanceof Error && (a.message.includes('Socket does not have mapped wrapper') || a.message.includes('xhr poll error') || a.message.includes('failed to restore sticky connection') || a.message.includes('ECONNRESET')))) {
        return;
    }
    originalError.apply(console, args);
};
const originalWarn = console.warn;
console.warn = function (...args) {
    if (args.some(a => typeof a === 'string' && (a.includes('lost connection') || a.includes('failed to connect') || a.includes('Socket does not have mapped wrapper') || a.includes('xhr poll error') || a.includes('failed to restore sticky connection') || a.includes('@firebase/firestore') || a.includes('ECONNRESET')))) {
        return;
    }
    if (args.some(a => a instanceof Error && (a.message.includes('Socket does not have mapped wrapper') || a.message.includes('xhr poll error') || a.message.includes('failed to restore sticky connection') || a.message.includes('ECONNRESET')))) {
        return;
    }
    originalWarn.apply(console, args);
};
const originalLog = console.log;
console.log = function (...args) {
    if (args.some(a => typeof a === 'string' && (a.includes('Socket does not have mapped wrapper') || a.includes('xhr poll error') || a.includes('failed to restore sticky connection') || a.includes('@firebase/firestore') || a.includes('ECONNRESET')))) {
        return;
    }
    if (args.some(a => a instanceof Error && (a.message.includes('Socket does not have mapped wrapper') || a.message.includes('xhr poll error') || a.message.includes('failed to restore sticky connection') || a.message.includes('ECONNRESET')))) {
        return;
    }
    originalLog.apply(console, args);
};`;

content = content.replace(/\/\/ Suppress noisy SDK internal transport warnings that do not affect functionality[\s\S]*?originalLog\.apply\(console, args\);\n};/, replacement);

fs.writeFileSync(file, content);
console.log("Patched logs 2");
