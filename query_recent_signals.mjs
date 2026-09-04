import { db } from "@workspace/db";
import { signals } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

async function run() {
    try {
        const recentSignals = await db.select().from(signals).orderBy(desc(signals.createdAt)).limit(5);
        console.log(JSON.stringify(recentSignals, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
