const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

// We add the commitSignal function
const append = `
export function commitSignal(signal: SignalResult) {
    if (signal.signal !== "HOLD") {
        lastSignalState = { signal: signal.signal, price: signal.entryPrice, timestamp: Date.now() };
        lastSignalTime = Date.now();
    }
}
`;

if (!code.includes('export function commitSignal')) {
    code += append;
}

// And remove the automatic commit in generateSignal
const target = `    if (finalSignal !== "HOLD" && isCommit) {
      lastSignalState = { signal: finalSignal, price: currentPrice, timestamp: now };
      lastSignalTime  = now;
    }`;
const replace = `    // (Commit logic moved to commitSignal, called by scheduler upon successful dispatch)`;

if (code.includes(target)) {
    code = code.replace(target, replace);
}

fs.writeFileSync(file, code);
