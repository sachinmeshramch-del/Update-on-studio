import MetaApi from "metaapi.cloud-sdk/esm-node";

async function main() {
  const token = process.env.META_API_TOKEN;
  const accountId = "6485ceb1-f6b8-4a1d-85e4-af6de3033116";
  const api = new MetaApi(token);
  const account = await api.metatraderAccountApi.getAccount(accountId);
  const rpc = account.getRPCConnection();
  await rpc.connect();
  await rpc.waitSynchronized({ timeoutInSeconds: 15 });

  const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deals = await rpc.getDealsByTimeRange(start, new Date());
  const positions = await rpc.getPositions();
  const orders = await rpc.getOrders();

  console.log("=== METATRADER 5 LIVE STATUS ===");
  console.log("Account:", account.name, "| Type:", account.type);
  console.log("Open Positions:", positions.length);
  if (positions.length > 0) {
    console.log("Positions:", JSON.stringify(positions, null, 2));
  }
  console.log("Pending Orders:", orders.length);
  console.log("Deals in last 24h:", deals.length);
  if (deals.length > 0) {
    console.log("Deals:", JSON.stringify(deals, null, 2));
  }
}

main().catch(err => console.error("Error:", err.message));
