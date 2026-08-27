import { MetaApi } from "metaapi.cloud-sdk/esm-node";
import 'dotenv/config';

async function run() {
    const api = new MetaApi(process.env.META_API_TOKEN);
    const accountId = process.env.META_ACCOUNT_ID;
    const account = await api.metatraderAccountApi.getAccount(accountId);
    await account.deploy();
    await account.waitConnected();
    const conn = account.getStreamingConnection();
    await conn.connect();
    await conn.waitSynchronized();
    const rpc = await account.getRPC();
    const syms = await rpc.getSymbols();
    console.log(syms.filter(s => s.toUpperCase().includes('XAU') || s.toUpperCase().includes('GOLD')));
    process.exit(0);
}
run().catch(console.error);
