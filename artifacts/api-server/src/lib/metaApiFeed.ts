import { getSystemSettings } from "@workspace/db";
import { setLatestPrice, type LivePrice } from "./priceEvents.js";
import { logger } from "./logger.js";
import type { OHLCCandle } from "./goldPrice.js";

// Suppress noisy SDK internal transport warnings that do not affect functionality
const originalError = console.error;
console.error = function (...args) {
    if (args.some(a => typeof a === 'string' && (a.includes('not connected to broker yet') || a.includes('timeoutError_TimeoutError') || a.includes('Socket does not have mapped wrapper') || a.includes('xhr poll error') || a.includes('failed to restore sticky connection') || a.includes('@firebase/firestore') || a.includes('ECONNRESET')))) {
        return;
    }
    if (args.some(a => a instanceof Error && (a.message.includes('not connected to broker yet') || a.message.includes('timeoutError_TimeoutError') || a.message.includes('Socket does not have mapped wrapper') || a.message.includes('xhr poll error') || a.message.includes('failed to restore sticky connection') || a.message.includes('ECONNRESET')))) {
        return;
    }
    originalError.apply(console, args);
};

const originalWarn = console.warn;
console.warn = function (...args) {
    if (args.some(a => typeof a === 'string' && (a.includes('lost connection') || a.includes('failed to connect') || a.includes('Socket does not have mapped wrapper') || a.includes('xhr poll error') || a.includes('failed to restore sticky connection') || a.includes('@firebase/firestore') || a.includes('ECONNRESET')))) {
        return;
    }
    if (args.some(a => a instanceof Error && (a.message.includes('Socket does not have mapped wrapper') || a.message.includes('xhr poll error') || a.message.includes('failed to restore sticky connection') || a.message.includes('ECONNRESET')))) {
        return;
    }
    originalWarn.apply(console, args);
};

const originalLog = console.log;
console.log = function (...args) {
    if (args.some(a => typeof a === 'string' && (a.includes('Socket does not have mapped wrapper') || a.includes('xhr poll error') || a.includes('failed to restore sticky connection') || a.includes('@firebase/firestore') || a.includes('ECONNRESET')))) {
        return;
    }
    if (args.some(a => a instanceof Error && (a.message.includes('Socket does not have mapped wrapper') || a.message.includes('xhr poll error') || a.message.includes('failed to restore sticky connection') || a.message.includes('ECONNRESET')))) {
        return;
    }
    originalLog.apply(console, args);
};

const token = process.env.META_API_TOKEN;

let SYMBOL = "XAUUSD";

let metaApi: any = null;
let connection: any = null;
let activeAccountObj: any = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let isListenerAttached = false;
let reconnectDelay = 5000;
let metaApiStatus: "disconnected" | "connecting" | "connected" = "disconnected";
let isConnecting = false;
let lastPriceReceivedAt = 0;
let activeAccountId: string | null = null;

// In-memory real-time candle stores updated by live ticks
const liveCandleStore: Record<string, OHLCCandle[]> = {
    "1m": [],
    "5m": [],
    "15m": [],
    "30m": [],
    "1h": []
};

export function getMetaApiStatus() {
    return metaApiStatus;
}

export function getLastPriceTime() {
    return lastPriceReceivedAt;
}

export async function getLivePrice() {
    if (!connection || !connection.terminalState) return null;
    const price = connection.terminalState.price(SYMBOL);
    if (!price) return null;
    return {
        bid: price.bid,
        ask: price.ask,
        spread: Number((price.ask - price.bid).toFixed(2))
    };
}

export async function stopMetaApiFeed() {
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
        } catch(e) {
            logger.error({err: e}, "Error closing MetaApi connection");
        }
        connection = null;
    }
    activeAccountObj = null;
    metaApiStatus = "disconnected";
    isListenerAttached = false;
    isConnecting = false;
}

/**
 * Updates in-memory candlestick data on every incoming live tick
 */
function updateLiveCandles(price: number, timestampMs: number) {
    const timeframes: Array<{ tf: string; intervalMs: number }> = [
        { tf: "1m", intervalMs: 60 * 1000 },
        { tf: "5m", intervalMs: 5 * 60 * 1000 },
        { tf: "15m", intervalMs: 15 * 60 * 1000 },
        { tf: "30m", intervalMs: 30 * 60 * 1000 },
        { tf: "1h", intervalMs: 60 * 60 * 1000 },
    ];

    for (const { tf, intervalMs } of timeframes) {
        const candles = liveCandleStore[tf];
        if (!candles || candles.length === 0) continue;

        const lastCandle = candles[candles.length - 1];
        const candleStartTime = Math.floor(timestampMs / intervalMs) * intervalMs;
        const lastCandleTime = lastCandle.time > 1000000000000 ? lastCandle.time : lastCandle.time * 1000;

        if (candleStartTime > lastCandleTime) {
            // New candle formed
            candles.push({
                time: Math.floor(candleStartTime / 1000),
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 1
            });
            if (candles.length > 500) candles.shift();
        } else {
            // Update current forming candle
            lastCandle.high = Math.max(lastCandle.high, price);
            lastCandle.low = Math.min(lastCandle.low, price);
            lastCandle.close = price;
            lastCandle.volume = (lastCandle.volume || 0) + 1;
        }
    }
}

/**
 * Main function to start and maintain MetaApi streaming feed
 */
export async function startMetaApiFeed() {
    if (isConnecting) {
        logger.info("MetaApi connection already in progress, skipping concurrent attempt.");
        return;
    }
    if (metaApiStatus === "connected" && connection && Date.now() - lastPriceReceivedAt < 30000) {
        return;
    }

    isConnecting = true;
    metaApiStatus = "connecting";
    logger.info("Starting MetaApi feed initialization...");

    try {
        const settings = await getSystemSettings().catch(() => ({} as any));
        const configuredSymbol = settings.metaApiSymbol || process.env.META_API_SYMBOL || "XAUUSD";
        SYMBOL = configuredSymbol.trim();
        
        const primaryAccountId = settings.tradingMode === 'REAL'
            ? (settings.realAccountId || settings.demoAccountId || (settings as any).metaAccountId || process.env.META_ACCOUNT_ID)
            : (settings.demoAccountId || settings.realAccountId || (settings as any).metaAccountId || process.env.META_ACCOUNT_ID);

        const secondaryAccountId = settings.tradingMode === 'REAL'
            ? settings.demoAccountId
            : settings.realAccountId;

        const candidateAccountIds = Array.from(new Set(
            [primaryAccountId, secondaryAccountId, (settings as any).metaAccountId, process.env.META_ACCOUNT_ID]
                .filter((id): id is string => Boolean(id && id.trim()))
        ));

        if (!token || candidateAccountIds.length === 0) {
            logger.error("META_API_TOKEN and account ID (in settings) must be set.");
            throw new Error("Missing MetaApi credentials");
        }

        const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
        if (!metaApi) {
            metaApi = new MetaApi(token, {
                requestTimeout: 30,
                connectTimeout: 30,
                packetTimeout: 30,
            });
        }

        let connectedAccount: any = null;
        let connectedAccountId: string | null = null;
        let lastConnError: any = null;

        // Clean up previous connection if any
        if (connection) {
            try {
                await connection.close();
            } catch {}
            connection = null;
        }

        for (const accountId of candidateAccountIds) {
            try {
                logger.info({ accountId }, "Attempting MetaApi connection to account...");
                const account = await metaApi.metatraderAccountApi.getAccount(accountId);
                
                if (account.state !== 'DEPLOYED') {
                    logger.info({ accountId }, "Deploying MetaApi account...");
                    await account.deploy();
                }
                
                try {
                    await account.waitConnected(20000);
                } catch (waitErr: any) {
                    logger.warn({ accountId, err: waitErr?.message }, "waitConnected warning/timeout, continuing...");
                }
                
                const streamingConn = account.getStreamingConnection();
                await streamingConn.connect();
                
                try {
                    await streamingConn.waitSynchronized(15000);
                } catch (syncErr: any) {
                    logger.warn({ syncErr: syncErr?.message }, "waitSynchronized timed out. Proceeding with subscription...");
                }

                // Attach robust Synchronization Listener
                streamingConn.addSynchronizationListener(
                    new Proxy({}, {
                        get(target, prop) {
                            if (prop === 'onSymbolPriceUpdated') {
                                return (instanceIndex: string, price: any) => {
                                    if (price.symbol === SYMBOL || price.symbol === "XAUUSD" || price.symbol === "GOLD" || price.symbol === "XAUUSDm") {
                                        const bid = price.bid;
                                        const ask = price.ask;
                                        if (typeof bid !== 'number' || typeof ask !== 'number') return;
                                        
                                        const spread = Number((ask - bid).toFixed(2));
                                        const midPrice = Number(((bid + ask) / 2).toFixed(2));
                                        lastPriceReceivedAt = Date.now();
                                        metaApiStatus = "connected";

                                        // Update in-memory real-time candles
                                        updateLiveCandles(midPrice, lastPriceReceivedAt);

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
                                            source: "metaapi" as const
                                        };
                                        setLatestPrice(live);
                                    }
                                };
                            }
                            if (prop === 'onDisconnected') {
                                return () => {
                                    logger.warn("MetaApi streaming disconnected. Will auto-recover.");
                                    metaApiStatus = "disconnected";
                                };
                            }
                            if (prop === 'onConnected' || prop === 'onReconnected') {
                                return async () => {
                                    metaApiStatus = "connected";
                                    logger.info("MetaApi streaming connection restored.");
                                    // Re-subscribe symbol to guarantee continuous streaming
                                    try {
                                        await streamingConn.subscribeToMarketData(SYMBOL);
                                    } catch {}
                                };
                            }
                            return () => {};
                        }
                    })
                );

                let subscribed = false;
                const candidates = [SYMBOL, "GOLD", "XAUUSD", "XAUUSDm", "XAUUSD.a", "XAUUSD#", "GOLDm", "XAUUSD_micro", "GOLDmicro", "XAUUSD.", "XAUUSDc", "XAUUSDb"];
                const symbolsToTry = Array.from(new Set(candidates));

                for (const sym of symbolsToTry) {
                    try {
                        await streamingConn.subscribeToMarketData(sym);
                        SYMBOL = sym; 
                        subscribed = true;
                        break;
                    } catch (e: any) {
                        continue;
                    }
                }

                if (!subscribed) {
                    throw new Error(`Failed to subscribe to Gold symbols on account ${accountId}`);
                }

                connection = streamingConn;
                connectedAccount = account;
                activeAccountObj = account;
                connectedAccountId = accountId;
                activeAccountId = accountId;
                metaApiStatus = "connected";
                lastPriceReceivedAt = Date.now();
                logger.info(`Successfully subscribed to MetaApi market data for ${SYMBOL} on account ${connectedAccountId}`);
                reconnectDelay = 5000;
                
                // Emit initial price if available in terminalState
                try {
                    const initialPrice = streamingConn.terminalState.price(SYMBOL);
                    if (initialPrice && initialPrice.bid && initialPrice.ask) {
                        const spread = Number((initialPrice.ask - initialPrice.bid).toFixed(2));
                        const midPrice = Number(((initialPrice.bid + initialPrice.ask) / 2).toFixed(2));
                        lastPriceReceivedAt = Date.now();
                        const live = {
                            price: midPrice,
                            bid: initialPrice.bid,
                            ask: initialPrice.ask,
                            spread,
                            change: 0,
                            changePercent: 0,
                            high24h: midPrice,
                            low24h: midPrice,
                            timestamp: new Date().toISOString(),
                            direction: "unchanged" as const,
                            ms: initialPrice.time ? initialPrice.time.getTime() : Date.now(),
                            source: "metaapi" as const
                        };
                        setLatestPrice(live);
                        updateLiveCandles(midPrice, lastPriceReceivedAt);
                    }
                } catch (e) {
                    logger.warn({err: e}, "Could not fetch initial price from terminalState");
                }

                break;
            } catch (accErr: any) {
                lastConnError = accErr;
                logger.warn({ accountId, err: accErr.message || String(accErr) }, "Failed connecting to candidate account, trying fallback...");
            }
        }

        if (!connectedAccount || !connection || metaApiStatus !== "connected") {
            throw lastConnError || new Error("Could not connect to any configured MetaApi account");
        }

        // Start active watchdog heartbeat timer
        startWatchdog();

    } catch (err: any) {
        metaApiStatus = "disconnected";
        if (err.name === 'ValidationError' && err.message.includes('symbol does not exist')) {
            logger.warn("MetaApi Feed error: The symbol '" + SYMBOL + "' does not exist on your broker. Please update META_API_SYMBOL.");
            reconnectDelay = 60000;
        } else if (err.message && err.message.includes('not connected to broker yet')) {
            logger.warn("MetaApi account is not connected to broker yet. Waiting for broker connection...");
            reconnectDelay = 15000;
        } else if (err.name === 'ForbiddenError' || (err.message && err.message.includes('top up your account'))) {
            logger.warn("MetaApi Account Not Deployed: Please log into your MetaApi dashboard and manually deploy this account, or top up your balance if required.");
            reconnectDelay = 120000;
        } else if (err.name === 'NotFoundError') {
            logger.warn("MetaApi Feed error: Account not found. The Account ID you provided doesn't exist on your MetaApi account. Please verify META_ACCOUNT_ID in your settings.");
            reconnectDelay = 120000;
        } else {
            logger.error({ err: err.message || err }, "MetaApi Feed connection error");
        }
        scheduleReconnect();
    } finally {
        isConnecting = false;
    }
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        logger.info("Executing scheduled MetaApi reconnect...");
        startMetaApiFeed();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000); 
}

/**
 * Active Watchdog Heartbeat
 * Ensures connection is alive and ticks are actively flowing.
 * If stalled for >45s or disconnected for >15s, automatically heals connection.
 */
function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(async () => {
        const now = Date.now();
        const secondsSinceLastTick = Math.floor((now - lastPriceReceivedAt) / 1000);

        if (metaApiStatus === "connected" && secondsSinceLastTick > 45 && !isConnecting) {
            logger.warn({ secondsSinceLastTick }, "[Watchdog] MetaApi tick stream stalled. Initiating auto-healing reconnection...");
            metaApiStatus = "disconnected";
            await startMetaApiFeed();
        } else if (metaApiStatus === "disconnected" && !isConnecting && !reconnectTimer) {
            logger.info("[Watchdog] MetaApi disconnected. Triggering reconnect...");
            await startMetaApiFeed();
        }
    }, 15000);
}

// ── Smart historical candle cache & rate-limit protector ──────────────────
const candleCache = new Map<string, { timestamp: number, data: OHLCCandle[], promise?: Promise<OHLCCandle[]> }>();
const HISTORICAL_CACHE_TTL = 180_000; // 3 minutes cache — prevents MetaApi REST request throttling

export async function getMetaApiHistoricalOHLC(timeframe: string, count: number): Promise<OHLCCandle[]> {
    const tf = timeframe || "5m";
    const cacheKey = `${SYMBOL}_${tf}_${count}`;
    const now = Date.now();

    // 1. If we have in-memory live synthesized candles with enough data, return immediately
    const liveCandles = liveCandleStore[tf];
    if (liveCandles && liveCandles.length >= Math.min(count, 50)) {
        return liveCandles.slice(-count);
    }

    // 2. Check historical cache
    const cached = candleCache.get(cacheKey);
    if (cached && (now - cached.timestamp < HISTORICAL_CACHE_TTL) && cached.data.length > 0) {
        return cached.data; 
    }
    
    // 3. If a fetch is already in flight, reuse the exact same promise (deduplication)
    if (cached && cached.promise) {
        return cached.promise;
    }

    if (!token) {
        throw new Error("MetaApi token not configured");
    }

    const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
    if (!metaApi) {
        metaApi = new MetaApi(token, { requestTimeout: 20, connectTimeout: 20 });
    }

    const settings = await getSystemSettings().catch(() => ({} as any));
    const accountIdsToTry = Array.from(new Set([
        activeAccountId,
        settings.realAccountId,
        settings.demoAccountId,
        process.env.META_ACCOUNT_ID
    ].filter((id): id is string => Boolean(id && id.trim()))));

    if (accountIdsToTry.length === 0) {
        throw new Error("No MetaApi account ID configured in settings");
    }

    const metaApiTimeframes: Record<string, string> = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "30m": "30m",
        "1h": "1h",
        "4h": "4h",
        "1d": "1d",
        "1w": "1w"
    };

    const targetTf = metaApiTimeframes[tf] || "5m";

    const fetchPromise = (async () => {
        try {
            const symbolsToTry = Array.from(new Set([SYMBOL, "GOLD", "XAUUSD", "XAUUSDm"]));
            let lastErr = null;

            for (const accId of accountIdsToTry) {
                try {
                    const account = await metaApi.metatraderAccountApi.getAccount(accId);
                    for (const sym of symbolsToTry) {
                        try {
                            const candles = await account.getHistoricalCandles(sym, targetTf, undefined, count);
                            if (candles && candles.length > 0) {
                                const formatted: OHLCCandle[] = candles.map((c: any) => ({
                                    time: typeof c.time === 'string' ? Math.floor(new Date(c.time).getTime() / 1000) : (c.time > 1000000000000 ? Math.floor(c.time / 1000) : c.time),
                                    open: c.open,
                                    high: c.high,
                                    low: c.low,
                                    close: c.close,
                                    volume: c.tickVolume || c.volume || 1
                                }));

                                // Populate live store and cache
                                liveCandleStore[tf] = [...formatted];
                                candleCache.set(cacheKey, { timestamp: Date.now(), data: formatted });
                                return formatted;
                            }
                        } catch (symErr) {
                            lastErr = symErr;
                        }
                    }
                } catch (accErr) {
                    lastErr = accErr;
                }
            }

            if (cached && cached.data.length > 0) {
                logger.warn("Serving cached historical candles after temporary MetaApi REST delay");
                return cached.data;
            }

            throw lastErr || new Error("Failed to fetch historical candles from MetaApi");
        } finally {
            const finalCache = candleCache.get(cacheKey);
            if (finalCache) {
                finalCache.promise = undefined;
            }
        }
    })();

    candleCache.set(cacheKey, { timestamp: now, data: cached?.data || [], promise: fetchPromise });
    return fetchPromise;
}


export async function executeTradeOnAccount(
    accountId: string,
    accountType: "DEMO" | "REAL",
    direction: "LONG" | "SHORT",
    stopLoss: number,
    takeProfit: number,
    volume: number = 0.01
) {
    if (!token) {
        throw new Error("META_API_TOKEN is not configured");
    }
    if (!accountId || !accountId.trim()) {
        throw new Error(`MetaApi ${accountType} Account ID is missing in settings`);
    }

    const targetAccountId = accountId.trim();
    logger.info({ accountType, accountId: targetAccountId, direction, stopLoss, takeProfit, volume }, `[MetaApi ${accountType}] Initiating trade execution...`);

    // If active streaming connection is already connected to this account, execute directly
    if (connection && activeAccountId === targetAccountId) {
        try {
            if (direction === "LONG") {
                const result = await connection.createMarketBuyOrder(SYMBOL, volume, stopLoss, takeProfit);
                logger.info({ accountType, accountId: targetAccountId, orderId: result.orderId, volume, stopLoss, takeProfit }, `[MetaApi ${accountType}] BUY trade executed successfully`);
                return result;
            } else {
                const result = await connection.createMarketSellOrder(SYMBOL, volume, stopLoss, takeProfit);
                logger.info({ accountType, accountId: targetAccountId, orderId: result.orderId, volume, stopLoss, takeProfit }, `[MetaApi ${accountType}] SELL trade executed successfully`);
                return result;
            }
        } catch (err: any) {
            logger.warn({ accountType, accountId: targetAccountId, err: err.message || String(err) }, `[MetaApi ${accountType}] Streaming connection trade execution failed, trying RPC connection fallback...`);
        }
    }

    // Secondary / targeted account execution via RPC connection
    try {
        const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
        if (!metaApi) {
            metaApi = new MetaApi(token);
        }

        const account = await metaApi.metatraderAccountApi.getAccount(targetAccountId);
        if (account.state !== 'DEPLOYED') {
            await account.deploy();
        }
        await account.waitConnected();

        const rpc = account.getRPCConnection();
        await rpc.connect();
        await rpc.waitSynchronized();

        if (direction === "LONG") {
            const result = await rpc.createMarketBuyOrder(SYMBOL, volume, stopLoss, takeProfit);
            logger.info({ accountType, accountId: targetAccountId, orderId: result.orderId, volume, stopLoss, takeProfit }, `[MetaApi ${accountType}] BUY trade executed successfully via RPC`);
            return result;
        } else {
            const result = await rpc.createMarketSellOrder(SYMBOL, volume, stopLoss, takeProfit);
            logger.info({ accountType, accountId: targetAccountId, orderId: result.orderId, volume, stopLoss, takeProfit }, `[MetaApi ${accountType}] SELL trade executed successfully via RPC`);
            return result;
        }
    } catch (err: any) {
        logger.error({ accountType, accountId: targetAccountId, err: err.message || String(err) }, `[MetaApi ${accountType}] Trade execution failed`);
        throw err;
    }
}

export async function executeTrade(direction: "LONG" | "SHORT", stopLoss: number, takeProfit: number, volume: number = 0.01) {
    if (!activeAccountId) {
        throw new Error("No active MetaApi account configured");
    }
    return executeTradeOnAccount(activeAccountId, "DEMO", direction, stopLoss, takeProfit, volume);
}

export async function modifyOpenPositionsStopLoss(direction: "LONG" | "SHORT", newStopLoss: number) {
    if (!connection) return;
    try {
        const positions = connection.terminalState?.positions || [];
        for (const pos of positions) {
            const isMatch = (direction === "LONG" && (pos.type === "POSITION_TYPE_BUY" || pos.type === 0)) ||
                            (direction === "SHORT" && (pos.type === "POSITION_TYPE_SELL" || pos.type === 1));
            if (isMatch && (pos.symbol === SYMBOL || pos.symbol === "XAUUSD")) {
                if (typeof connection.modifyPosition === "function") {
                    await connection.modifyPosition(pos.id, newStopLoss, pos.takeProfit);
                    logger.info({ positionId: pos.id, newStopLoss, symbol: pos.symbol }, "[MetaApi Execution] Updated open position trailing Stop Loss on MT5");
                }
            }
        }
    } catch (err: any) {
        logger.warn({ err: err.message || String(err) }, "[MetaApi Execution] Failed to update position Stop Loss on MT5");
    }
}

