const originalWarn = console.warn;
console.warn = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('lost connection')) {
        if (args[1] instanceof Error && (args[1].message.includes('xhr post error') || args[1].message.includes('xhr poll error'))) {
            return; // Suppress
        }
    }
    originalWarn.apply(console, args);
};

console.warn("london:1:abc: lost connection", new Error("xhr post error"));
console.warn("should print");
