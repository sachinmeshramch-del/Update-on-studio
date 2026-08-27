const fs = require('fs');
let file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'logger.error({ err }, "Scalp signal generation failed");',
  `if (err.message && (err.message.includes('status code 503') || err.message.includes('MetaApi is not connected'))) {
      logger.warn(\`[SignalEngine] MetaApi unavailable: \${err.message}. Signals paused.\`);
    } else {
      logger.error({ err }, "Scalp signal generation failed");
    }`
);

fs.writeFileSync(file, content);
console.log("Patched signalEngine!");
