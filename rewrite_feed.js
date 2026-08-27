const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

// I will find "export async function startMetaApiFeed() {" 
// and "export function scheduleReconnect() {" 
// or similar and replace the whole block!

const startIdx = content.indexOf("export async function startMetaApiFeed() {");
const endIdx = content.indexOf("function scheduleReconnect() {");

const newFunc = `export async function startMetaApiFeed() {
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
    
    if (metaApiStatus === "connecting") return; // Prevent double-initialization
    
    metaApiStatus = "connecting";
    try {
        if (!metaApi) {
            metaApi = new MetaApi(token);
        }
        const account = await metaApi.metatraderAccountApi.getAccount(activeAccountId);
        if (account.state !== 'DEPLOYED') {
            await account.deploy();
        }
        await account.waitConnected();

        connection = account.getStreamingConnection();
        await connection.connect();
        
        try {
            await Promise.race([
                connection.waitSynchronized(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("waitSynchronized timeout")), 30000))
            ]);
        } catch(err: any) {
            logger.warn("waitSynchronized timed out. Subscription might fail."); // Proceeding, but we increased timeout to 30s so it should be rare
        }
        
        // Listen to price quotes
        if (!isListenerAttached) {
            isListenerAttached = true;
            connection.addSynchronizationListener(
                new Proxy({}, {
                    get(target, prop) {
                        if (prop === 'onSymbolPriceUpdated') {
                            return (instanceIndex: string, price: any) => {
                                if (price.symbol === SYMBOL || price.symbol === "XAUUSD") {
                                    const bid = price.bid;
                                    const ask = price.ask;
                                    const spread = Number((ask - bid).toFixed(2));
                                    const midPrice = Number(((bid + ask) / 2).toFixed(2));
                                    
                                    logger.info(
                                        { "[MetaApi] Price": midPrice, Time: Date.now(), bid, ask, spread },
                                        "[MetaApi] Price received"
                                    );
                                    const live = {
                                        price: midPrice,
                                        bid,
                                        ask,
                                        spread,
                                        change: 0,
                                        changePercent: 0,
                                        high24h: midPrice,
                                        low24h: midPrice,
                                        timestamp: new Date().toISOString(),
                                        direction: "unchanged" as const,
                                        ms: Date.now(),
                                        source: "metaapi" as const,
                                    };
                                    
                                    setLatestPrice(live);
                                }
                            };
                        }
                        if (prop === 'onDisconnected') {
                            return () => {
                                metaApiStatus = "disconnected";
                                logger.warn("MetaApi disconnected. SDK will auto-reconnect.");
                            };
                        }
                        if (prop === 'onConnected') {
                            return () => {
                                metaApiStatus = "connected";
                                logger.info("MetaApi connection restored.");
                            };
                        }
                        return () => {};
                    }
                })
            );
        }

        await connection.subscribeToMarketData(SYMBOL);
        metaApiStatus = "connected";
        logger.info(\`Successfully subscribed to MetaApi market data for \${SYMBOL}\`);
        reconnectDelay = 5000; // Reset backoff on success
    } catch (err: any) {
        metaApiStatus = "disconnected";
        if (err.name === 'ValidationError' && err.message.includes('symbol does not exist')) {
            logger.warn("MetaApi Feed error: The symbol '" + SYMBOL + "' does not exist on your broker. Please update META_API_SYMBOL.");
            reconnectDelay = 300000;
        } else if (err.message && err.message.includes('not connected to broker yet')) {
            logger.warn("MetaApi account is not connected to broker yet. Waiting for broker connection...");
            reconnectDelay = 60000; // 1 minute backoff to reduce log spam
        } else {
            logger.error({ err }, "MetaApi Feed error");
        }
        scheduleReconnect();
    }
}

`;

content = content.substring(0, startIdx) + newFunc + content.substring(endIdx);
fs.writeFileSync(file, content);
