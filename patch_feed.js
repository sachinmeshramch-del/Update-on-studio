const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

// I removed accountId previously by regex, let's verify if `accountId` is still used
// we will replace `if (!token || !accountId)` with fetching settings.
const replacement = `let activeAccountId: string | null = null;

export async function stopMetaApiFeed() {
    if (connection) {
        try {
            logger.info("Disconnecting current MetaApi connection...");
            await connection.close();
            connection = null;
        } catch(e) {
            logger.error({err: e}, "Error closing connection");
        }
    }
    metaApiStatus = "disconnected";
    isListenerAttached = false;
}

export async function startMetaApiFeed() {
    const settings = await getSystemSettings();
    const accountId = settings.tradingMode === 'REAL' ? settings.realAccountId : settings.demoAccountId;
    
    if (!token || !accountId) {
        logger.error("META_API_TOKEN and META_ACCOUNT_ID (in settings) must be set.");
        throw new Error("Missing MetaApi credentials");
    }
    
    // If account ID changed, close old connection
    if (activeAccountId && activeAccountId !== accountId) {
        logger.info("Account ID changed, reconnecting...");
        await stopMetaApiFeed();
    }
    activeAccountId = accountId;
`;

content = content.replace("export async function startMetaApiFeed() {\n    if (!token || !accountId) {\n        logger.error(\"META_API_TOKEN and META_ACCOUNT_ID must be set in the environment.\");\n        throw new Error(\"Missing MetaApi credentials\");", replacement);

fs.writeFileSync(file, content);
