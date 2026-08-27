const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /connection\.addSynchronizationListener\(\{[\s\S]*?onDisconnected: \(\) => \{[\s\S]*?scheduleReconnect\(\);\n            \}\n        \}\);/;

const proxyCode = `connection.addSynchronizationListener(
            new Proxy({}, {
                get(target, prop) {
                    if (prop === 'onSymbolPriceUpdated') {
                        return (instanceIndex, price) => {
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
                                    direction: "unchanged",
                                    ms: Date.now(),
                                    source: "metaapi",
                                };
                                
                                setLatestPrice(live);
                            }
                        };
                    }
                    if (prop === 'onDisconnected') {
                        return () => {
                            metaApiStatus = "disconnected";
                            logger.warn("MetaApi disconnected. Scheduling reconnect.");
                            scheduleReconnect();
                        };
                    }
                    return () => {};
                }
            })
        );`;

code = code.replace(regex, proxyCode);
fs.writeFileSync(file, code);
