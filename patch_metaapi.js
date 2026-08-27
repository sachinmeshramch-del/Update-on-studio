const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `if (args.some(a => a instanceof Error && (a.message.includes('Socket does not have mapped wrapper') || a.message.includes('xhr poll error') || a.message.includes('failed to restore sticky connection') || a.message.includes('ECONNRESET')))) {`,
  `if (args.some(a => a instanceof Error && (a.message.includes('not connected to broker yet') || a.message.includes('timeoutError_TimeoutError') || a.message.includes('Socket does not have mapped wrapper') || a.message.includes('xhr poll error') || a.message.includes('failed to restore sticky connection') || a.message.includes('ECONNRESET')))) {`
);

content = content.replace(
  `logger.warn({ err: err.message }, "MetaApi fetch timed out or failed, falling back to TwelveData");`,
  `// Check if error is due to broker not being connected, suppress noisy logs
            if (err.message && (err.message.includes('not connected to broker yet') || err.message.includes('timeoutError'))) {
                // Silently fallback without logging warning spam
            } else {
                logger.warn({ err: err.message }, "MetaApi fetch timed out or failed, falling back to TwelveData");
            }`
);

fs.writeFileSync(file, content);
