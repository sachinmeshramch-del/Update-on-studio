const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/signalScheduler.ts', 'utf8');

code = code.replace(
`const SCHEDULER_INTERVAL = 5_000 + Math.floor(Math.random() * 2000); // 5-7 seconds with jitter fallback`,
`const SCHEDULER_INTERVAL = 1_000; // 1 second polling for rapid signal generation`
);

fs.writeFileSync('artifacts/api-server/src/lib/signalScheduler.ts', code);
