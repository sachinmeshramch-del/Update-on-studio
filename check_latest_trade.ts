import { getClosedTrades, getRunningTrades } from "./lib/db/src/dao";

async function run() {
  const closed = await getClosedTrades(1);
  const running = await getRunningTrades();
  console.log(JSON.stringify({
    latestClosed: closed[0]?.createdAt,
    running: running.map(r => r.id),
    timestamp: Date.now()
  }));
  process.exit(0);
}
run().catch(console.error);
