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
    const spec1 = await connection.getSymbolSpecification('GOLD');
    console.log("GOLD spec:", spec1);
    const spec2 = await connection.getSymbolSpecification('XAUUSD').catch(() => null);
    console.log("XAUUSD spec:", spec2);
    const spec3 = await connection.getSymbolSpecification('GOLD24-7').catch(() => null);
    console.log("GOLD24-7 spec:", spec3);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
