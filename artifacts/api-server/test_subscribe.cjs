const MetaApiPkg = require('metaapi.cloud-sdk');
const MetaApi = MetaApiPkg.default || MetaApiPkg;

async function run() {
  const token = process.env.META_API_TOKEN;
  const accountId = process.env.META_ACCOUNT_ID;
  if (!token || !accountId) {
    console.log("Missing token or account ID");
    return;
  }
  
  const api = new MetaApi(token);
  try {
    const account = await api.metatraderAccountApi.getAccount(accountId);
    await account.waitConnected();
    const connection = account.getStreamingConnection();
    await connection.connect();
    await connection.waitSynchronized();
    console.log("Subscribing to GOLD...");
    await connection.subscribeToMarketData('GOLD');
    console.log("Subscribed successfully!");
    const price = connection.terminalState.price('GOLD');
    console.log(price);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
