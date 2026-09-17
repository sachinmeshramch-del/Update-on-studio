const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `                        invalidAccountBlacklist.add(accId);
                        logger.debug({ accId }, "Quietly blacklisted invalid MetaApi account ID");`;
const replace = `                        invalidAccountBlacklist.add(accId);
                        logger.debug({ accId }, "Quietly blacklisted invalid MetaApi account ID");
                        // We do not throw or warn loudly here, just skip to the next account`;

if (code.includes(target) && !code.includes('We do not throw or warn loudly here')) {
    code = code.replace(target, replace);
}

// Ensure accountIdsToTry filters out blacklisted ids
const target2 = `    ].filter((id): id is string => Boolean(id && isValidAccountId(id) && true))));`;
const replace2 = `    ].filter((id): id is string => Boolean(id && isValidAccountId(id) && !invalidAccountBlacklist.has(id)))));`;

if (code.includes(target2)) {
    code = code.replace(target2, replace2);
}

fs.writeFileSync(file, code);
