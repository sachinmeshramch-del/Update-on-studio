const token = process.env.META_API_TOKEN;
const accountId = '6485ceb1-f6b8-4a1d-85e4-af6de3033116';
async function test() {
  const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
  const metaApi = new MetaApi(token);
  const account = await metaApi.metatraderAccountApi.getAccount(accountId);
  const rpc = account.getRPCConnection();
  await rpc.connect();
  await rpc.waitSynchronized({ timeoutInSeconds: 10 }).catch(()=>console.log('not sync'));
  const candles = await rpc.getCandles('GOLD', '1m', undefined, 5);
  console.log("GOLD candles:", candles);
  const candles2 = await rpc.getCandles('GOLD24-7', '1m', undefined, 5).catch(e => e.message);
  console.log("GOLD24-7 candles:", candles2);
}
test().catch(console.error).then(() => process.exit(0));
