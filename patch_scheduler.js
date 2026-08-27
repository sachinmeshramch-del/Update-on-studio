const fs = require('fs');

let file = 'artifacts/api-server/src/lib/signalScheduler.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('logger.warn({ err }, "Signal scheduler tick failed");', `if (err instanceof Error && err.message.includes('MetaApi is not connected')) {
      // Ignore gracefully
    } else {
      logger.warn({ err }, "Signal scheduler tick failed");
    }`);
fs.writeFileSync(file, content);

file = 'artifacts/api-server/src/lib/signalEngine.ts';
content = fs.readFileSync(file, 'utf8');
// just in case, verify signalEngine's throw: throw new Error("MetaApi is not connected. Signals paused.");
// Yes, that matches.

