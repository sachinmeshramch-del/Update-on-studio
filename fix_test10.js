const fs = require('fs');
let code = fs.readFileSync('test.ts', 'utf8');

code = code.replace(
`    if (existing && existing.connected) {
        existing.lastUsed = Date.now();
        return existing.rpc;
    const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");`,
`    if (existing && existing.connected) {
        existing.lastUsed = Date.now();
        return existing.rpc;
    }
    const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");`);

code = code.replace(
`    if (!metaApi) {
        metaApi = new MetaApi(token, { requestTimeout: 30, connectTimeout: 30 });
    const account = await metaApi.metatraderAccountApi.getAccount(trimmed);`,
`    if (!metaApi) {
        metaApi = new MetaApi(token, { requestTimeout: 30, connectTimeout: 30 });
    }
    const account = await metaApi.metatraderAccountApi.getAccount(trimmed);`);

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
    const rpc = account.getRPCConnection();`);

fs.writeFileSync('test.ts', code);
