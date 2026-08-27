const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'let reconnectTimer: ReturnType<typeof setTimeout> | null = null;',
  'let reconnectTimer: ReturnType<typeof setTimeout> | null = null;\nlet isListenerAttached = false;'
);

const listenerCode = `
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
                                // Do not manually scheduleReconnect here, SDK handles streaming reconnects!
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
`;

const oldListenerRegex = /\/\/ Listen to price quotes[\s\S]*?connection\.addSynchronizationListener\([\s\S]*?\}\s*\)\s*\);/m;
content = content.replace(oldListenerRegex, listenerCode.trim());

// If we are throwing error from startMetaApiFeed in catch, we can still manually reconnect if initial connection fails
// but we just shouldn't do it on every disconnect from the listener
fs.writeFileSync(file, content);
console.log("Patched listener leak");
