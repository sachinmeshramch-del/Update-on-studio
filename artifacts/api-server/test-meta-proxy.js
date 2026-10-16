import MetaApi from 'metaapi.cloud-sdk/esm-node';
const token = process.env.META_API_TOKEN;
const accountId = process.env.META_ACCOUNT_ID;
const SYMBOL = "GOLD";

async function test() {
  console.log("Testing with Symbol:", SYMBOL);
  const metaApi = new MetaApi(token);
  const account = await metaApi.metatraderAccountApi.getAccount(accountId);
  console.log("Account State:", account.state);
  
  await account.waitConnected();
  console.log("Connected to account");
  const connection = account.getStreamingConnection();
  await connection.connect();
  await connection.waitSynchronized();
  console.log("Synchronized");
  
  const listener = new Proxy({}, {
      get(target, prop) {
          console.log("MetaApi asked for:", prop);
          return () => {};
      }
  });
  
  connection.addSynchronizationListener(listener);
  console.log("Listener added");
  
  await connection.subscribeToMarketData(SYMBOL);
  console.log("Subscribed successfully");
  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
