const MetaApiPkg = require('metaapi.cloud-sdk');
const MetaApi = MetaApiPkg.default || MetaApiPkg;

async function run() {
  const api = new MetaApi(process.env.META_API_TOKEN);
  try {
    const account = await api.metatraderAccountApi.getAccount(process.env.META_ACCOUNT_ID);
    await account.waitConnected();
    const connection = account.getRPCConnection(); // try RPC connection? Or does it need streaming?
    // wait, historical candles in my test should use what metaApiFeed uses...
    // metaApiFeed uses account.getHistoricalCandles, which is on the `account` object, not connection.
    const candles = await account.getHistoricalCandles('GOLD', '1h', undefined, 10);
    console.log("Historical candles:", candles);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
