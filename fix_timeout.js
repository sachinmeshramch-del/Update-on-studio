const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'new Promise((_, reject) => setTimeout(() => reject(new Error("waitSynchronized timeout")), 5000))',
    'new Promise((_, reject) => setTimeout(() => reject(new Error("waitSynchronized timeout")), 30000))'
);

// Also remove the proceeding anyway catch, or at least if it times out, maybe we shouldn't proceed?
// Actually if it times out, maybe we should just throw so it retries.
content = content.replace(
    'logger.warn("waitSynchronized timed out, proceeding anyway...");',
    'logger.warn("waitSynchronized timed out. Subscription might fail."); // Proceeding, but we increased timeout to 30s so it should be rare'
);

fs.writeFileSync(file, content);
console.log("Patched metaApiFeed.ts timeout");
