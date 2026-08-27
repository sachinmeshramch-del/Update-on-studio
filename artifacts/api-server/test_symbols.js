import MetaApi from "metaapi.cloud-sdk/esm-node";
import dotenv from 'dotenv';
dotenv.config({path: '../../.env'});

async function run() {
    const api = new MetaApi(process.env.META_API_TOKEN);
    const accountId = "6485ceb1-f6b8-4a1d-85e4-af6de3033116"; // from settings logged earlier
    const account = await api.metatraderAccountApi.getAccount(accountId);
    await account.deploy();
    await account.waitConnected();
    const conn = account.getStreamingConnection();
    await conn.connect();
    await conn.waitSynchronized();
    const rpc = await account.getRPC();
    const syms = await rpc.getSymbols();
    console.log("Gold related symbols:");
    console.log(syms.filter(s => s.toUpperCase().includes('XAU') || s.toUpperCase().includes('GOLD')));
    process.exit(0);
}
run().catch(console.error);
