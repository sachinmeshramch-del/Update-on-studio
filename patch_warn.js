const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'logger.error("MetaApi Feed error: Cannot deploy account. Please top up your MetaApi account or manually deploy the account in the MetaApi dashboard.");',
  'logger.warn("MetaApi Account Not Deployed: Please log into your MetaApi dashboard and manually deploy this account, or top up your balance if required.");'
);

fs.writeFileSync(file, content);
