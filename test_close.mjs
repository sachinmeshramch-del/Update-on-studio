import { db } from "./lib/db/dist/index.js";
import { getSignalById, updateTradeStatus } from "./lib/db/dist/dao.js";

async function run() {
    try {
        const id = "zimj6zXZ5ulFqNExugc5";
        const signal = await getSignalById(id);
        console.log(signal);
        await updateTradeStatus(id, "MANUALLY_CLOSED", 4370.00, -10.00);
        console.log("Updated!");
    } catch (e) {
        console.error("FAIL:", e);
    }
    process.exit(0);
}
run();
