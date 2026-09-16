import { getOpenBrokerPositions } from "./artifacts/api-server/src/lib/metaApiFeed.js";

async function run() {
    try {
        const r = await getOpenBrokerPositions();
        console.log("MT5 Running:", JSON.stringify(r, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
