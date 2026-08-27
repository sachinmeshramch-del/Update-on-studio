import MetaApi from 'metaapi.cloud-sdk/esm-node/index.js';
const token = process.env.META_API_TOKEN;
const accountId = process.env.META_ACCOUNT_ID;
const SYMBOL = process.env.META_API_SYMBOL || "XAUUSD";

async function test() {
  console.log("Testing with Symbol:", SYMBOL);
  const metaApi = new MetaApi(token);
  const account = await metaApi.metatraderAccountApi.getAccount(accountId);
  console.log("Account State:", account.state);
  if (account.state !== 'DEPLOYED') {
      console.log("Deploying...");
      await account.deploy();
  }
  await account.waitConnected();
  console.log("Connected to account");
  const connection = account.getStreamingConnection();
  await connection.connect();
  await connection.waitSynchronized();
  console.log("Synchronized");
  await connection.subscribeToMarketData(SYMBOL);
  console.log("Subscribed successfully");
  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
