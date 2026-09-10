import { updateTradeStatus } from "@workspace/db";

async function run() {
    try {
        await updateTradeStatus("JSUEsjFJdKfJdyBAzYaa", "STOP_HIT", 4389.40, -5.41);
        await updateTradeStatus("Lg9XG49RNFneRPt55vqJ", "STOP_HIT", 4395.95, -4.36);
        console.log("Reconciled both trades!");
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
