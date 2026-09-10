const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');

code = code.replace(
`    const closedDeal = liveClosedDeals.find(d => String(d.positionId) === idStr);
    if (closedDeal) {
        return true;
    return false;
}`,
`    const closedDeal = liveClosedDeals.find(d => String(d.positionId) === idStr);
    if (closedDeal) {
        return true;
    }
    return false;
}`);

fs.writeFileSync('test.ts', code);
