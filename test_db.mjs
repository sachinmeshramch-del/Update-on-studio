import { getLatestSignal, getRunningTrades } from "@workspace/db";
async function run() {
    const s = await getRunningTrades();
    console.log("Running trades:", s);
}
run();
