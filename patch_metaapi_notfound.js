const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `} else if (err.name === 'NotFoundError') {
            logger.warn("MetaApi Feed error: Account not found. The Account ID you provided doesn't exist on your MetaApi account. Please verify META_ACCOUNT_ID in your settings.");
            reconnectDelay = 300000;
        } else {
            logger.error({ err }, "MetaApi Feed error");
        }`;

content = content.replace(`} else {
            logger.error({ err }, "MetaApi Feed error");
        }`, replacement);

fs.writeFileSync(file, content);
