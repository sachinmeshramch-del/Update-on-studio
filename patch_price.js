const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

// Also filter in getMetaApiPrice
const targetPrice = `            .filter((id): id is string => Boolean(id && isValidAccountId(id) && true))`;
const replacePrice = `            .filter((id): id is string => Boolean(id && isValidAccountId(id) && !invalidAccountBlacklist.has(id)))`;

if (code.includes(targetPrice)) {
    code = code.replace(targetPrice, replacePrice);
}

fs.writeFileSync(file, code);
