import { db } from '@workspace/db/client';
import { signals } from '@workspace/db/schema';
import { desc, eq } from 'drizzle-orm';

async function query() {
    const running = await db.select().from(signals).where(eq(signals.tradeStatus, 'RUNNING'));
    console.log("Running trades:", running.length);
    if(running.length > 0) {
        console.log(running);
    }
}
query();
