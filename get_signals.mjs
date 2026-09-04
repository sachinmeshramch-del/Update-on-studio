import { getRecentSignals, getRunningTrades } from "@workspace/db";
async function run() {
    const s = await getRunningTrades();
    console.log("RUNNING TRADES:", s);
    const r = await getRecentSignals(5);
    console.log("RECENT SIGNALS:", r);
    process.exit(0);
}
run();
