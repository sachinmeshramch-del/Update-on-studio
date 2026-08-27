import MetaApi from 'metaapi.cloud-sdk/esm-node';
const token = process.env.META_API_TOKEN;
const accountId = process.env.META_ACCOUNT_ID;
async function test() {
  const metaApi = new MetaApi(token);
  const account = await metaApi.metatraderAccountApi.getAccount(accountId);
  const rpc = account.getRPCConnection();
  
  const proto = Object.getPrototypeOf(rpc);
  console.log("RPC Connection methods:", Object.getOwnPropertyNames(proto));
  console.log("account methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(account)));
  
  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
