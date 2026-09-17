const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    if (accountIdsToTry.length === 0) {
        throw new Error("No valid MetaApi account ID configured in settings");
    }`;
const replace = `    if (accountIdsToTry.length === 0) {
        throw new Error("No valid MetaApi account ID configured in settings");
    }`;

if (code.includes('const account = await metaApi.metatraderAccountApi.getAccount(accountId);') && !code.includes('invalidAccountBlacklist.add(accountId);')) {
    code = code.replace(
        'const account = await metaApi.metatraderAccountApi.getAccount(accountId);',
        `const account = await metaApi.metatraderAccountApi.getAccount(accountId).catch((accErr: any) => {
            const errMsg = accErr.message || String(accErr);
            if (errMsg.toLowerCase().includes('account') && (errMsg.includes('does not exist') || errMsg.includes('NotFoundError') || errMsg.includes('not found'))) {
                invalidAccountBlacklist.add(accountId);
                logger.debug({ accountId }, "Quietly blacklisted invalid MetaApi account ID");
            }
            throw accErr;
        });`
    );
}

fs.writeFileSync(file, code);
