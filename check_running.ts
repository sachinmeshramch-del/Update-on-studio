import { getRunningTrades } from "./artifacts/api-server/node_modules/@workspace/db/dist/index.mjs";
import { getOpenBrokerPositions } from "./artifacts/api-server/src/lib/metaApiFeed.js";

async function run() {
    try {
        const r = await getRunningTrades();
        console.log("DB Running:", JSON.stringify(r, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
