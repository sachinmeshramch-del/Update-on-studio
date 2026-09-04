const token = process.env.META_API_TOKEN;
const accountId = '6485ceb1-f6b8-4a1d-85e4-af6de3033116';

async function test() {
  const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
  const metaApi = new MetaApi(token);
  const account = await metaApi.metatraderAccountApi.getAccount(accountId);
  console.log("State:", account.state);
  const connection = account.getStreamingConnection();
  await connection.connect();
  console.log("Connected to streaming");
  const rpc = account.getRPCConnection();
  await rpc.connect();
  await rpc.waitSynchronized({ timeoutInSeconds: 10 }).catch(() => console.log('not sync'));
  const symbols = await rpc.getSymbols();
  console.log("Found symbols:", symbols.filter(s => s.includes('XAU') || s.includes('GOLD')));
  await connection.subscribeToMarketData('XAUUSD');
  console.log("Subscribed");
}
test().catch(e => console.error(e.message)).then(() => process.exit(0));
