import MetaApi from "metaapi.cloud-sdk/esm-node";
async function test() {
  const metaApi = new MetaApi(process.env.META_API_TOKEN as string, { requestTimeout: 30 });
  const account = await metaApi.metatraderAccountApi.getAccount(process.env.META_ACCOUNT_ID as string);
  console.log("Account", account.id);
  await account.waitConnected(60);
  const rpc = account.getRPCConnection();
  await rpc.connect();
  await rpc.waitSynchronized();
  const symbols = await rpc.getSymbols();
  console.log("Found", symbols.length, "symbols");
  const goldSymbols = symbols.filter(s => s.toUpperCase().includes("XAU") || s.toUpperCase().includes("GOLD"));
  console.log("Gold candidates:", goldSymbols);
  process.exit(0);
}
test();
