const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `                const isBuy = foundRpcPos.type === "POSITION_TYPE_BUY" || foundRpcPos.type === 0;
                        const pos: BrokerPosition = {`;
const replace = `                const isBuy = foundRpcPos.type === "POSITION_TYPE_BUY" || foundRpcPos.type === 0;
                        const pos: BrokerPosition = {`;

// Just checking if we can optimize the wait time
const target2 = `const pollInterval = options?.pollIntervalMs ?? 50;
    const maxWait = options?.maxWaitMs ?? 1000;`;
const replace2 = `const pollInterval = options?.pollIntervalMs ?? 100;
    const maxWait = options?.maxWaitMs ?? 3000;`;

if (code.includes(target2) && !code.includes('maxWaitMs ?? 3000')) {
    code = code.replace(target2, replace2);
    fs.writeFileSync(file, code);
}
