import { db } from './src/db/client.js';
import { signals } from './src/db/schema.js';
import { desc, eq } from 'drizzle-orm';

async function query() {
    const running = await db.select().from(signals).where(eq(signals.tradeStatus, 'RUNNING'));
    console.log("Running trades:", running.length);
    if(running.length > 0) {
        console.log(running);
    }
}
query();
