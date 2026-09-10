const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

const regex = /export function isPositionInClosureSequence[\s\S]*?export function clearPositionClosure/m;
const replacement = `export function isPositionInClosureSequence(positionId: string): boolean {
    if (!positionId) return false;
    const idStr = String(positionId);
    
    // 1. Check in-flight closure tracker
    const record = pendingClosurePositions.get(idStr);
    if (record) {
        if (Date.now() - record.timestamp < 45_000) {
            return true;
        }
        pendingClosurePositions.delete(idStr);
    }

    // 2. Check if deal already exited
    const closedDeal = liveClosedDeals.find(d => String(d.positionId) === idStr);
    if (closedDeal) {
        return true;
    }
    return false;
}

export function clearPositionClosure`;

code = code.replace(regex, replacement);
fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
