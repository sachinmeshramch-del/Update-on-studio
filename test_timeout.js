const token = process.env.META_API_TOKEN;
const accountId = '6485ceb1-f6b8-4a1d-85e4-af6de3033116';
async function test() {
  const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
  const metaApi = new MetaApi(token);
  const account = await metaApi.metatraderAccountApi.getAccount(accountId);
  const conn = account.getStreamingConnection();
  await conn.connect();
  console.log("Connected, trying XAUUSD...");
  const t1 = Date.now();
  try {
    await conn.subscribeToMarketData('XAUUSD');
  } catch (e) {
    console.log("Failed XAUUSD, took", Date.now() - t1, "ms");
  }
}
test().catch(console.error).then(() => process.exit(0));
