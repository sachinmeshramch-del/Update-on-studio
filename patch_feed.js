const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `            try {
                logger.info({ accountId }, "Attempting MetaApi connection to account...");
                const account = await metaApi.metatraderAccountApi.getAccount(accountId);`;
const replace = `            try {
                logger.info({ accountId }, "Attempting MetaApi connection to account...");
                const account = await metaApi.metatraderAccountApi.getAccount(accountId).catch((accErr: any) => {
                    const errMsg = accErr.message || String(accErr);
                    if (errMsg.toLowerCase().includes('account') && (errMsg.includes('does not exist') || errMsg.includes('NotFoundError') || errMsg.includes('not found'))) {
                        invalidAccountBlacklist.add(accountId);
                        logger.debug({ accountId }, "Quietly blacklisted invalid MetaApi account ID");
                    }
                    throw accErr;
                });`;

if (code.includes('const account = await metaApi.metatraderAccountApi.getAccount(accountId);') && !code.includes('invalidAccountBlacklist.add(accountId);')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
