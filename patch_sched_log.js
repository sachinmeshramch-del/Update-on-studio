const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    if (signal.signal === "HOLD" || signal.circuitBreakerActive) {
      if (signal.circuitBreakerActive) {`;

const replace = `    if (signal.signal === "HOLD" || signal.circuitBreakerActive) {
      if (signal.signal === "HOLD") {
        logger.info({ reason: signal.reason }, "Scheduler: Holding signal");
      }
      if (signal.circuitBreakerActive) {`;

if (code.includes(target) && !code.includes('Scheduler: Holding signal')) {
    code = code.replace(target, replace);
    fs.writeFileSync(file, code);
}
