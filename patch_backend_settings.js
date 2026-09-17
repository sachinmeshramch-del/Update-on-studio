const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const target1 = `        const primaryAccountId = settings.tradingMode === 'REAL'
            ? (settings.realAccountId || settings.demoAccountId || (settings as any).metaAccountId || process.env.META_ACCOUNT_ID)
            : (settings.demoAccountId || settings.realAccountId || (settings as any).metaAccountId || process.env.META_ACCOUNT_ID);

        const secondaryAccountId = settings.tradingMode === 'REAL'
            ? settings.demoAccountId
            : settings.realAccountId;

        const rawCandidates = [primaryAccountId, secondaryAccountId, (settings as any).metaAccountId, process.env.META_ACCOUNT_ID];`;

const replace1 = `        const primaryAccountId = settings.realAccountId || (settings as any).metaAccountId || process.env.META_ACCOUNT_ID;
        const rawCandidates = [primaryAccountId, (settings as any).metaAccountId, process.env.META_ACCOUNT_ID];`;

code = code.replace(target1, replace1);

const target2 = `        settings.demoAccountId,`;
code = code.replace(target2, '');

const target3 = `        const targetAccId = accountId || activeAccountId || settings.realAccountId || settings.demoAccountId;`;
const replace3 = `        const targetAccId = accountId || activeAccountId || settings.realAccountId;`;
code = code.replace(target3, replace3);

fs.writeFileSync(file, code);
