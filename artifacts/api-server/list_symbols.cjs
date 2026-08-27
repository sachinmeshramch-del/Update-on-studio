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
    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized();
    const symbols = await connection.getSymbols();
    console.log("Available symbols containing GOLD or XAU:");
    console.log(symbols.filter(s => s.toUpperCase().includes('GOLD') || s.toUpperCase().includes('XAU')));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
