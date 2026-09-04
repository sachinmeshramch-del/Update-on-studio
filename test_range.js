import fs from 'fs';
const path = './artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(path, 'utf8');
const search = `if (finalSignal === "HOLD" && currentAdx < 25 && rangeInfo.isRanging) {`;
const replace = `
    // [DEBUG RANGE]
    logger.info({
        adx: currentAdx,
        isRanging: rangeInfo.isRanging,
        rsi: rsi,
        prevRsi: rsi5mArr[rsi5mArr.length - 2] ?? 50,
        position: rangeInfo.position,
        support: rangeInfo.support,
        resistance: rangeInfo.resistance,
        currentPrice
    }, "[Range Strategy Status]");
    
    if (finalSignal === "HOLD" && currentAdx < 25 && rangeInfo.isRanging) {
`;
code = code.replace(search, replace);
fs.writeFileSync(path, code);
