const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');

code = code.replace(
`export function isPositionInClosureSequence(positionId: string): boolean {
    if (!positionId) return false;
    const idStr = String(positionId);
    
    // 1. Check in-flight closure tracker
    const record = pendingClosurePositions.get(idStr);
    if (record) {
        if (Date.now() - record.timestamp < 45_000) {
            return true;
            pendingClosurePositions.delete(idStr);
    // 2. Check if deal already exited
    const closedDeal = liveClosedDeals.find(d => String(d.positionId) === idStr);
    if (closedDeal) {
        return true;
    return false;
}`,
`export function isPositionInClosureSequence(positionId: string): boolean {
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
}`);

fs.writeFileSync('test.ts', code);
