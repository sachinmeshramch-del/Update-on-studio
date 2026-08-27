const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    metaApiStatus = "connecting";
    try {
        if (!metaApi) {
            metaApi = new MetaApi(token);
        }
        const account = await metaApi.metatraderAccountApi.getAccount(accountId);
        if (account.state !== 'DEPLOYED') {
            await account.deploy();
        }
        await account.waitConnected();
        connection = account.getStreamingConnection();
        await connection.connect();
        
        try {
            await Promise.race([
                connection.waitSynchronized(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("waitSynchronized timeout")), 5000))
            ]);
        } catch(err) {
            logger.warn("waitSynchronized timed out, proceeding anyway...");
        }`;

const replacement = `    metaApiStatus = "connecting";
    try {
        if (!metaApi) {
            metaApi = new MetaApi(token);
        }
        const withTimeout = (promise, ms, name) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(name + " timeout")), ms))]);
        
        const account = await withTimeout(metaApi.metatraderAccountApi.getAccount(accountId), 15000, "getAccount");
        if (account.state !== 'DEPLOYED') {
            await withTimeout(account.deploy(), 15000, "deploy");
        }
        await withTimeout(account.waitConnected(), 15000, "waitConnected");
        connection = account.getStreamingConnection();
        await withTimeout(connection.connect(), 15000, "connect");
        
        try {
            await withTimeout(connection.waitSynchronized(), 5000, "waitSynchronized");
        } catch(err) {
            logger.warn("waitSynchronized timed out, proceeding anyway...");
        }`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("PATCHED");
