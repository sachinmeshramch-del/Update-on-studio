const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

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
    originalLog.apply(console, args);`,
`    ))) {
        return;
    }
    originalLog.apply(console, args);`
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
