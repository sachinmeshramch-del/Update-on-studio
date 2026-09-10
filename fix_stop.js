const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');

const regex = /export async function stopMetaApiFeed\(\) \{[\s\S]*?\}/m;
const replacement = `export async function stopMetaApiFeed() {
    if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (connection) {
        try {
            logger.info("Disconnecting current MetaApi connection...");
            await connection.close();
        } catch (e: any) {
            logger.error({err: e}, "Error closing MetaApi connection");
        }
        connection = null;
    }
    activeAccountObj = null;
    metaApiStatus = "disconnected";
    isListenerAttached = false;
    isConnecting = false;
}`;

code = code.replace(regex, replacement);
fs.writeFileSync('artifacts/api-server/src/lib/metaApiFeed.ts', code);
