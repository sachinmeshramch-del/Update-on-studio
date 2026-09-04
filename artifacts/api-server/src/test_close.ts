import { getSignalById, updateTradeStatus } from "@workspace/db";

async function run() {
    try {
        const id1 = "zimj6zXZ5ulFqNExugc5";
        const id2 = "MYJ0jBFh4nq3o49ZMfhQ";
        await updateTradeStatus(id1, "MANUALLY_CLOSED", 4370.00, -10.00);
        await updateTradeStatus(id2, "MANUALLY_CLOSED", 4370.00, -10.00);
        console.log("Updated both trades!");
    } catch (e) {
        console.error("FAIL:", e);
    }
    process.exit(0);
}
run();
