const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

code = code.replace(
`    if (!metaApi) {
        metaApi = new MetaApi(token, { requestTimeout: 30, connectTimeout: 30 });
    const account = await metaApi.metatraderAccountApi.getAccount(trimmed);`,
`    if (!metaApi) {
        metaApi = new MetaApi(token, { requestTimeout: 30, connectTimeout: 30 });
    }
    const account = await metaApi.metatraderAccountApi.getAccount(trimmed);`
);

code = code.replace(
`    if (account.state !== 'DEPLOYED') {
        await Promise.race([
            account.deploy(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Deploy timeout")), 4000))
        ]).catch(() => {});
    const rpc = account.getRPCConnection();`,
`    if (account.state !== 'DEPLOYED') {
        await Promise.race([
            account.deploy(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Deploy timeout")), 4000))
        ]).catch(() => {});
    }
    const rpc = account.getRPCConnection();`
);

fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
