const token = process.env.META_API_TOKEN;
const accountId = '6485ceb1-f6b8-4a1d-85e4-af6de3033116';
async function test() {
  const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
  const metaApi = new MetaApi(token);
  const account = await metaApi.metatraderAccountApi.getAccount(accountId);
  if (account.getHistoricalCandles) {
    console.log("account.getHistoricalCandles exists");
  } else {
    console.log("account.getHistoricalCandles DOES NOT EXIST");
  }
}
test().catch(console.error).then(() => process.exit(0));
