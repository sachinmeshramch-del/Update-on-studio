const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/signalScheduler.ts', 'utf8');
code = code.replace(
  'if (running.some(r => r.signal === signal.signal)) {\n        logger.info({ signal: signal.signal }, "Scheduler: Suppressing signal (running trade already active)");\n        return;\n      }',
  'if (running.length > 0) {\n        logger.info({ runningCount: running.length, newSignal: signal.signal }, "Scheduler: Suppressing signal (a trade is already active)");\n        return;\n      }'
);
fs.writeFileSync('artifacts/api-server/src/lib/signalScheduler.ts', code);
