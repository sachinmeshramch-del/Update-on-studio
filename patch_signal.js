const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `logger.warn({ err: err.message }, "MetaApi history failed, falling back to fetchOHLC for " + tf);`,
  `if (err.message && (err.message.includes('not connected to broker yet') || err.message.includes('timeoutError'))) {
          // Silent fallback
        } else {
          logger.warn({ err: err.message }, "MetaApi history failed, falling back to fetchOHLC for " + tf);
        }`
);

content = content.replace(
  `logger.warn("MetaApi is not connected, falling back to fetchOHLC for " + tf);`,
  `// logger.warn("MetaApi is not connected, falling back to fetchOHLC for " + tf); // Removed to reduce spam`
);

fs.writeFileSync(file, content);
