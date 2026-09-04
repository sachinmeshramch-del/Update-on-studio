import MetaApi from "metaapi.cloud-sdk/esm-node";
import 'dotenv/config';

async function test() {
  const metaApi = new MetaApi.default(process.env.META_API_TOKEN, {
    requestTimeout: 60, connectTimeout: 60, packetTimeout: 60
  });
  const account = await metaApi.metatraderAccountApi.getAccount(process.env.META_ACCOUNT_ID);
  
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
  } catch(e) { console.error("sync error:", e.message) }
  
  const syms = ["XAUUSD", "GOLD", "XAUUSDm"];
  for (let sym of syms) {
      try {
          console.log("Subscribing to", sym);
          await streamingConn.subscribeToMarketData(sym);
          console.log("Subscribed to", sym);
          break;
      } catch(e) {
          console.error("Sub error for", sym, ":", e.message);
      }
  }
  
  console.log("Done.");
  process.exit(0);
}
test();
