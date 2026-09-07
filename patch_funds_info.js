const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const oldFunc = `export async function getAccountEquity(accountId: string): Promise<number | null> {
    try {
        if (!token) return null;
        if (!accountId) return null;
        
        // If we have an active streaming connection for this exact account, get it instantly
        if (connection && activeAccountId === accountId.trim() && connection.terminalState?.accountInformation) {
            return connection.terminalState.accountInformation.equity;
        }

        // Otherwise fallback to RPC
        const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
        if (!metaApi) metaApi = new MetaApi(token);
        
        const account = await metaApi.metatraderAccountApi.getAccount(accountId.trim());
        const rpc = account.getRPCConnection();
        await rpc.connect();
        await rpc.waitSynchronized();
        const info = await rpc.getAccountInformation();
        
        // Cleanup RPC connection to prevent memory leaks
        setTimeout(() => {
           try { rpc.close(); } catch(e) {}
        }, 5000);
        
        return info.equity;
    } catch (err: any) {
        logger.error({ err: err.message || err, accountId }, "[MetaApi] Failed to fetch account equity");
        return null;
    }
}`;

const newFunc = `export interface AccountFundsInfo {
    equity: number;
    leverage: number;
    freeMargin: number;
}

export async function getAccountFundsInfo(accountId: string): Promise<AccountFundsInfo | null> {
    try {
        if (!token) return null;
        if (!accountId) return null;
        
        // If we have an active streaming connection for this exact account, get it instantly
        if (connection && activeAccountId === accountId.trim() && connection.terminalState?.accountInformation) {
            const info = connection.terminalState.accountInformation;
            return { equity: info.equity, leverage: info.leverage || 0, freeMargin: info.freeMargin || 0 };
        }

        // Otherwise fallback to RPC
        const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
        if (!metaApi) metaApi = new MetaApi(token);
        
        const account = await metaApi.metatraderAccountApi.getAccount(accountId.trim());
        const rpc = account.getRPCConnection();
        await rpc.connect();
        await rpc.waitSynchronized();
        const info = await rpc.getAccountInformation();
        
        // Cleanup RPC connection to prevent memory leaks
        setTimeout(() => {
           try { rpc.close(); } catch(e) {}
        }, 5000);
        
        return { equity: info.equity, leverage: info.leverage || 0, freeMargin: info.freeMargin || 0 };
    } catch (err: any) {
        logger.error({ err: err.message || err, accountId }, "[MetaApi] Failed to fetch account funds info");
        return null;
    }
}`;

content = content.replace(oldFunc, newFunc);
fs.writeFileSync(file, content);
console.log("Patched metaApiFeed.ts with getAccountFundsInfo");
