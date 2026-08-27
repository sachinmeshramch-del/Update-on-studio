const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `} else if (err.name === 'ForbiddenError' || (err.message && err.message.includes('top up your account'))) {
            logger.error("MetaApi Feed error: Cannot deploy account. Please top up your MetaApi account or manually deploy the account in the MetaApi dashboard.");
            reconnectDelay = 300000;
        } else {
            logger.error({ err }, "MetaApi Feed error");
        }`;

content = content.replace(`} else {
            logger.error({ err }, "MetaApi Feed error");
        }`, replacement);

fs.writeFileSync(file, content);
