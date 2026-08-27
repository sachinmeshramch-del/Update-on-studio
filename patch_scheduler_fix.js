const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'import { getRunningTrades, insertSignal } from "@workspace/db";',
    'import { getRunningTrades, insertSignal, getLatestSignal } from "@workspace/db";'
);

const newLogic = `    // ── Deduplication guard (DB-backed, survives restarts) ─────────────────
    // Do NOT insert if there is already a RUNNING signal in the same direction.
    // This prevents duplicate rows caused by server restarts resetting in-memory
    // cooldown state while the signal engine's cache replays the same signal.
    try {
      const running = await getRunningTrades();
      const existing = running.slice(0, 1); // Limit to ONE running trade total, regardless of direction
      if (existing.length > 0) {
        logger.info(
          { existingId: existing[0].id, direction: signal.signal },
          "Scheduler: RUNNING signal already open — skipping insert",
        );
        return;
      }
      
      // Secondary Guard: Prevent rapid re-firing of the SAME signal (fake signals due to immediate stop out)
      const latest = await getLatestSignal();
      if (latest) {
        const timeSinceLatest = Date.now() - latest.createdAt.getTime();
        // If the latest signal in the DB is less than 5 minutes old, DO NOT FIRE ANOTHER.
        // This is a hard floor that survives server restarts and quick stop-outs.
        if (timeSinceLatest < 5 * 60 * 1000) {
           logger.info(
             { latestId: latest.id, msAgo: timeSinceLatest },
             "Scheduler: Previous signal fired within 5 mins — skipping duplicate insert"
           );
           return;
        }
      }
    } catch (checkErr) {`;

content = content.replace(
    /\/\/ ── Deduplication guard[\s\S]*?\} catch \(checkErr\) \{/,
    newLogic
);

fs.writeFileSync(file, content);
console.log("Patched signalScheduler.ts");
