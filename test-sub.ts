async function test() {
  const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
  const metaApi = new MetaApi(process.env.META_API_TOKEN as string, {
    requestTimeout: 60, connectTimeout: 60, packetTimeout: 60
  });
  const account = await metaApi.metatraderAccountApi.getAccount(process.env.META_ACCOUNT_ID as string);
  console.log("Account:", account.id, "state:", account.state);
  
  if (account.state !== 'DEPLOYED') {
      console.log("Deploying...");
      await account.deploy();
  }
  
  console.log("Waiting connected...");
  await account.waitConnected(60);
  
  console.log("Connecting streaming...");
  const streamingConn = account.getStreamingConnection();
  await streamingConn.connect();
  
  const syncId = Math.random().toString(36).substring(2, 15);
  try {
      console.log("Waiting sync...");
      await streamingConn.waitSynchronized({ timeoutInSeconds: 15, synchronizationId: syncId });
  } catch(e: any) { console.error("sync error:", e.message) }
  
  const syms = ["XAUUSD", "GOLD", "XAUUSDm"];
  for (let sym of syms) {
      try {
          console.log("Subscribing to", sym);
          await streamingConn.subscribeToMarketData(sym);
          console.log("Subscribed to", sym);
          break;
      } catch(e: any) {
          console.error("Sub error for", sym, ":", e.message);
      }
  }
  
  console.log("Done.");
  process.exit(0);
}
test();
