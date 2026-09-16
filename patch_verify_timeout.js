const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

// The original line to search for
const target = `    const verification = await verifyOrderStatusBeforeUpdate(positionId, {
        accountId,
        orderId,
        pollIntervalMs: 50,
        maxWaitMs: 1000
    });`;

// Replacing maxWaitMs 1000 -> 3000
const replace = `    const verification = await verifyOrderStatusBeforeUpdate(positionId, {
        accountId,
        orderId,
        pollIntervalMs: 50,
        maxWaitMs: 3000
    });`;

if (code.includes(target) && !code.includes('maxWaitMs: 3000')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
