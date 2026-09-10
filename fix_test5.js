const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');

code = code.replace(
`    ))) {
        return;
    if (args.some(a => a instanceof Error && (`,
`    ))) {
        return;
    }
    if (args.some(a => a instanceof Error && (`
);
code = code.replace(
`    ))) {
        return;
    if (args.some(a => a instanceof Error && (`,
`    ))) {
        return;
    }
    if (args.some(a => a instanceof Error && (`
);
code = code.replace(
`    ))) {
        return;
    if (args.some(a => a instanceof Error && (`,
`    ))) {
        return;
    }
    if (args.some(a => a instanceof Error && (`
);

code = code.replace(
`    ))) {
        return;
    originalError.apply(console, args);`,
`    ))) {
        return;
    }
    originalError.apply(console, args);`
);
code = code.replace(
`    ))) {
        return;
    originalWarn.apply(console, args);`,
`    ))) {
        return;
    }
    originalWarn.apply(console, args);`
);
code = code.replace(
`    ))) {
        return;
    originalLog.apply(console, args);`,
`    ))) {
        return;
    }
    originalLog.apply(console, args);`
);
fs.writeFileSync('test.ts', code);
