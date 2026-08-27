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
    const symbols = await connection.getSymbols();
    console.log(symbols.filter(s => s.toUpperCase().includes('XAU')));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
