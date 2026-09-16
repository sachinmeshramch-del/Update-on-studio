const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    // ── Deduplication Guard (Scheduler Level) ───────────────────────────────
    try {
      const sysSettings = await getSystemSettings();
      if (!sysSettings.disableCooldowns) {
          const latest = await getLatestSignal();
          if (latest && latest.signal === signal.signal) {
            const msSince = Date.now() - latest.createdAt.getTime();
            if (msSince < 20 * 60 * 1000) {
              logger.info({ signal: signal.signal, msSince }, "Scheduler: Suppressing duplicate signal (fired within 20 min)");
              return;
            }
          }
      }`;

const replace = `    // ── Deduplication Guard (Scheduler Level) ───────────────────────────────
    try {
      const latest = await getLatestSignal();
      if (latest && latest.signal === signal.signal) {
        const msSince = Date.now() - latest.createdAt.getTime();
        if (msSince < 5 * 60 * 1000) {
          logger.info({ signal: signal.signal, msSince }, "Scheduler: Suppressing duplicate signal (fired within 5 min)");
          return;
        }
      }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
