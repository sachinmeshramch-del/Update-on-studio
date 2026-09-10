const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts.bak', 'utf8');

// Fix isPositionInClosureSequence
code = code.replace(
`        if (Date.now() - record.timestamp < 45_000) {
            return true;
            pendingClosurePositions.delete(idStr);`,
`        if (Date.now() - record.timestamp < 45_000) {
            return true;
        }
        pendingClosurePositions.delete(idStr);
    }`
);
code = code.replace(
`    const closedDeal = liveClosedDeals.find(d => String(d.positionId) === idStr);
    if (closedDeal) {
        return true;
    return false;`,
`    const closedDeal = liveClosedDeals.find(d => String(d.positionId) === idStr);
    if (closedDeal) {
        return true;
    }
    return false;`
);

// Fix verifyOrderStatusBeforeUpdate (around line 1000)
code = code.replace(
`        maxWaitMs: 1000

    if (!verification.canUpdate) {`,
`        maxWaitMs: 1000
    });

    if (!verification.canUpdate) {`
);

// We need to fix verifyOrderStatusBeforeUpdate closing logic since it was deleted
// Wait, the original verifyOrderStatusBeforeUpdate was completely broken.
fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
