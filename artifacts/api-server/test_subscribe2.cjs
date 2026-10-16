const MetaApiPkg = require('metaapi.cloud-sdk');
const MetaApi = MetaApiPkg.default || MetaApiPkg;

async function run() {
  const api = new MetaApi(process.env.META_API_TOKEN);
  try {
    const account = await api.metatraderAccountApi.getAccount(process.env.META_ACCOUNT_ID);
    await account.waitConnected();
    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized();
    console.log("Subscribing to GOLD...");
    await connection.subscribeToMarketData('GOLD');
    console.log("Subscribed successfully!");
    const price = connection.terminalState.price('GOLD');
    console.log("Price:", price);
    process.exit(0);
  } catch (e) {
    console.error("Error subscribing:", e);
    process.exit(1);
  }
}
run();
