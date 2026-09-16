import { getRunningTrades } from '@workspace/db';

async function run() {
    try {
        const running = await getRunningTrades();
        console.log("Running trades length:", running.length);
        console.dir(running, { depth: null });
    } catch(e) {
        console.error(e);
    }
}
run();
