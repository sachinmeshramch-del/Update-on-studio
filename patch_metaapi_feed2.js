const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `            // Re-use existing connected account instance if possible instead of doing a full rest call every time
            let account;
            if (connection && connection.terminalState) {
                // If we have a streaming connection, we already have the account deployed
                account = await withTimeout(metaApi.metatraderAccountApi.getAccount(accountId), 15000, "getAccount");
            } else {
                account = await withTimeout(metaApi.metatraderAccountApi.getAccount(accountId), 15000, "getAccount");
            }`;

const replacement = `            // Fetch the account instance (the SDK usually caches this internally)
            const account = await withTimeout(metaApi.metatraderAccountApi.getAccount(accountId), 15000, "getAccount");`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED");
} else {
  console.log("NOT FOUND");
}
