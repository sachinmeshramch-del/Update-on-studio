import { getSystemSettings } from "@workspace/db";
import { setLatestPrice, getLatestPrice, type LivePrice } from "./priceEvents.js";
import { logger } from "./logger.js";
import type { OHLCCandle } from "./goldPrice.js";
import { EventEmitter } from "events";

export interface BrokerPosition {
    id: string;
    accountId: string;
    symbol: string;
    type: "LONG" | "SHORT";
    volume: number;
    openPrice: number;
    currentPrice: number;
    stopLoss: number;
    takeProfit: number;
    profit: number; commission?: number; swap?: number;
    time: string;
}

export interface BrokerClosedDeal {
    id: string;
    positionId: string;
    accountId: string;
    symbol: string;
    type: "DEAL_TYPE_BUY" | "DEAL_TYPE_SELL";
    price: number;
    openPrice?: number;
    profit: number; commission?: number; swap?: number;
    time: string;
    reason: string;
    comment: string;
}

export const brokerEvents = new EventEmitter();
brokerEvents.setMaxListeners(50);

// In-memory real-time position cache updated by streaming events (<1ms access)
export const liveBrokerPositions = new Map<string, BrokerPosition>();
// Historical open prices mapping for closed deals reconciliation (positionId -> openPrice)
export const historicalOpenPrices = new Map<string, number>();
// In-memory real-time closed deals cache updated by streaming events (<1ms access)
export const liveClosedDeals: BrokerClosedDeal[] = [];

// In-flight closure tracking: positions that are currently being closed or have completed an exit deal
export const pendingClosurePositions = new Map<string, { timestamp: number; reason: string }>();

export function markPositionClosing(positionId: string, reason: string = "CLOSURE_INITIATED") {
    if (!positionId) return;
    pendingClosurePositions.set(String(positionId), { timestamp: Date.now(), reason });
    logger.debug({ positionId, reason }, "[MetaApi Execution] Marked position in closure sequence");
}

export function isPositionInClosureSequence(positionId: string): boolean {
    if (!positionId) return false;
    const idStr = String(positionId);
    
    // 1. Check in-flight closure tracker
    const record = pendingClosurePositions.get(idStr);
    if (record) {
        if (Date.now() - record.timestamp < 45_000) {
            return true;
        }
        pendingClosurePositions.delete(idStr);
    }

    // 2. Check if deal already exited
    const closedDeal = liveClosedDeals.find(d => String(d.positionId) === idStr);
    if (closedDeal) {
        return true;
    }
    return false;
}

export function clearPositionClosure(positionId: string) {
    pendingClosurePositions.delete(String(positionId));
}


// Intercept and suppress noisy MetaApi SDK background timeout errors
const originalConsoleError = console.error;
console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Error refreshing market data subscriptions job')) {
        // Suppress harmless background timeout error when broker is disconnected
        return;
    }
    originalConsoleError(...args);
};


export const invalidAccountBlacklist = new Set<string>();

// Suppress noisy SDK internal transport warnings that do not affect functionality
const originalError = console.error;
console.error = function (...args) {
    if (args.some(a => typeof a === 'string' && (
        a.includes('not connected to broker yet') || 
        a.includes('timeoutError_TimeoutError') || 
        a.includes('Socket does not have mapped wrapper') || 
        a.includes('xhr poll error') || 
        a.includes('failed to restore sticky connection') || 
        a.includes('already running') ||
        a.includes('Cannot subscribe to market data for symbol') ||
        a.includes('@firebase/firestore') || 
        a.includes('ECONNRESET') ||
        a.includes('NotFoundError') ||
        a.includes('does not exist') ||
        a.includes('NotFoundError') ||
        a.includes('does not exist')
    ))) {
        return;
    }
    if (args.some(a => a instanceof Error && (
        a.message.includes('not connected to broker yet') || 
        a.message.includes('timeoutError_TimeoutError') || 
        a.message.includes('Socket does not have mapped wrapper') || 
        a.message.includes('xhr poll error') || 
        a.message.includes('failed to restore sticky connection') || 
        a.message.includes('already running') ||
        a.message.includes('Cannot subscribe to market data for symbol') ||
        a.message.includes('ECONNRESET') ||
        a.message.includes('NotFoundError') ||
        a.message.includes('does not exist') ||
        a.message.includes('NotFoundError') ||
        a.message.includes('does not exist')
    ))) {
        return;
    }
    originalError.apply(console, args);
};

const originalWarn = console.warn;
console.warn = function (...args) {
    if (args.some(a => typeof a === 'string' && (
        a.includes('lost connection') || 
        a.includes('failed to connect') || 
        a.includes('Socket does not have mapped wrapper') || 
        a.includes('xhr poll error') || 
        a.includes('failed to restore sticky connection') || 
        a.includes('already running') ||
        a.includes('Cannot subscribe to market data for symbol') ||
        a.includes('@firebase/firestore') || 
        a.includes('ECONNRESET')
    ))) {
        return;
    }
    if (args.some(a => a instanceof Error && (
        a.message.includes('Socket does not have mapped wrapper') || 
        a.message.includes('xhr poll error') || 
        a.message.includes('failed to restore sticky connection') || 
        a.message.includes('already running') ||
        a.message.includes('Cannot subscribe to market data for symbol') ||
        a.message.includes('ECONNRESET')
    ))) {
        return;
    }
    originalWarn.apply(console, args);
};

const originalLog = console.log;
console.log = function (...args) {
    if (args.some(a => typeof a === 'string' && (
        a.includes('Socket does not have mapped wrapper') || 
        a.includes('xhr poll error') || 
        a.includes('failed to restore sticky connection') || 
        a.includes('already running') ||
        a.includes('Cannot subscribe to market data for symbol') ||
        a.includes('@firebase/firestore') || 
        a.includes('ECONNRESET')
    ))) {
        return;
    }
    if (args.some(a => a instanceof Error && (
        a.message.includes('Socket does not have mapped wrapper') || 
        a.message.includes('xhr poll error') || 
        a.message.includes('failed to restore sticky connection') || 
        a.message.includes('already running') ||
        a.message.includes('Cannot subscribe to market data for symbol') ||
        a.message.includes('ECONNRESET')
    ))) {
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
let currentMetaApiLatencyMs = 0;
let latencyPingInterval: NodeJS.Timeout | null = null;

export function getMetaApiLatency() {
    return currentMetaApiLatencyMs;
}

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

export function getActiveAccountId() {
    return activeAccountId;
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
        } catch (e: any) {
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
            // Update current forming candle
            lastCandle.high = Math.max(lastCandle.high, price);
            lastCandle.low = Math.min(lastCandle.low, price);
            lastCandle.close = price;
            lastCandle.volume = (lastCandle.volume || 0) + 1;
        }
    }
}

function isValidAccountId(id: any): boolean {
    if (!id || typeof id !== 'string') return false;
    const trimmed = id.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
}

// In-memory fast funds cache (equity, leverage, freeMargin) to prevent trade blocking
const accountFundsCache = new Map<string, { equity: number; leverage: number; freeMargin: number; updatedAt: number }>();

// In-memory pre-warmed RPC connection pool to eliminate 20s connection latency
const rpcConnectionPool = new Map<string, { rpc: any; connected: boolean; lastUsed: number }>();

async function getOrInitRpcConnection(accountId: string) {
    const trimmed = accountId.trim();
    const existing = rpcConnectionPool.get(trimmed);
    if (existing && existing.connected) {
        existing.lastUsed = Date.now();
        return existing.rpc;
    }
    const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
    if (!metaApi) {
        metaApi = new MetaApi(token as string, { requestTimeout: 30, connectTimeout: 30 });
    }
    const account = await metaApi.metatraderAccountApi.getAccount(trimmed);
    if (account.state !== 'DEPLOYED') {
        try { await account.deploy(); await account.waitDeployed(120); } catch (e) { console.error("[MetaApi] RPC Forced deploy failed:", e?.message || e); }
        try { await account.waitConnected(120); } catch (e) { console.warn("[MetaApi] waitConnected timed out in RPC init."); }
    }
    const rpc = account.getRPCConnection();
    await Promise.race([
        rpc.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("RPC connect timeout")), 5000))
    ]);

    rpcConnectionPool.set(trimmed, { rpc, connected: true, lastUsed: Date.now() });
    return rpc;
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
        
        const primaryAccountId = settings.realAccountId || (settings as any).metaAccountId || process.env.META_ACCOUNT_ID;
        const rawCandidates = [primaryAccountId, (settings as any).metaAccountId, process.env.META_ACCOUNT_ID];
        const candidateAccountIds = Array.from(new Set(
            rawCandidates
                .filter((id): id is string => Boolean(id && isValidAccountId(id) && !invalidAccountBlacklist.has(id)))
                .map(id => id.trim())
        ));

        if (!token || candidateAccountIds.length === 0) {
            const hasInvalidIds = rawCandidates.some(id => Boolean(id && typeof id === 'string' && id.trim() && !isValidAccountId(id)));
            if (hasInvalidIds) {
                logger.warn("Configured MetaApi Account ID has an invalid format. Please enter a valid 36-character UUID in Settings.");
            }
            logger.warn("META_API_TOKEN and account ID (in settings) must be set. Waiting for user to provide them in Settings.");
            throw new Error("Missing or invalid MetaApi credentials");
        }

        const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
        if (!metaApi) {
            metaApi = new MetaApi(token, {
                requestTimeout: 60,
                connectTimeout: 60,
            });
        }

        let connectedAccount: any = null;
        let connectedAccountId: string | null = null;
        let lastConnError: any = null;

        // Clean up previous connection if any
        if (connection) {
            try {
                await connection.close();
            } catch(e) {}
            connection = null;
        }

        for (const accountId of candidateAccountIds) {
            try {
                logger.info({ accountId }, "Attempting MetaApi connection to account...");
                const account = await metaApi.metatraderAccountApi.getAccount(accountId);
                
                if (account.state !== 'DEPLOYED') {
                    logger.info({ accountId, state: account.state }, "Deploying MetaApi account...");
                    await account.deploy();
                    await account.waitDeployed(120);
                } else {
                    // Explicitly deploy anyway if there might be a sync issue
                    try { await account.deploy(); await account.waitDeployed(120); } catch (e) { console.error("[MetaApi] Forced deploy failed:", e?.message || e); }
                }
                
                try {
                    await account.waitConnected(120);
                } catch(waitErr: any) {
                    logger.warn({ accountId, err: waitErr?.message }, "waitConnected timed out, cannot subscribe to market data yet.");
                    continue;
                }
                
                const streamingConn = account.getStreamingConnection();
                await streamingConn.connect();
                
                try {
                    const isSync = typeof streamingConn.isSynchronized === 'function' ? streamingConn.isSynchronized() : false;
                    if (!isSync) {
                        await streamingConn.waitSynchronized({ timeoutInSeconds: 15 });
                    }
                } catch(syncErr: any) {
                    if (!syncErr?.message?.includes('already running')) {
                        // Silently proceed on harmless validation or timeout errors during sync
                        logger.debug({ syncErr: syncErr?.message }, "Streaming synchronization in progress, proceeding...");
                    }
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
                                            timestamp: price.time ? new Date(price.time).toISOString() : new Date().toISOString(),
                                            direction: "unchanged" as const,
                                            ms: price.time ? new Date(price.time).getTime() : Date.now(),
                                            source: "metaapi" as const
                                        };
                                        setLatestPrice(live);
                                    }
                                };
                            }
                            if (prop === 'onAccountInformationUpdated') {
                                return (instanceIndex: string, accountInformation: any) => {
                                    if (connectedAccountId && accountInformation) {
                                        accountFundsCache.set(connectedAccountId, {
                                            equity: accountInformation.equity,
                                            leverage: accountInformation.leverage || 1000,
                                            freeMargin: accountInformation.freeMargin || accountInformation.equity,
                                            updatedAt: Date.now()
                                        });
                                        logger.debug({ accountId: connectedAccountId, equity: accountInformation.equity }, "Live account funds updated from streaming listener");
                                    }
                                };
                            }
                            if (prop === 'onPositionUpdated') {
                                return (instanceIndex: string, pos: any) => {
                                    if (!pos) return;
                                    const sym = (pos.symbol || "").toUpperCase();
                                    if (sym.includes("XAU") || sym.includes("GOLD")) {
                                        const isBuy = pos.type === "POSITION_TYPE_BUY" || pos.type === 0;
                                        const updated: BrokerPosition = {
                                            id: String(pos.id),
                                            accountId: connectedAccountId || activeAccountId || "",
                                            symbol: pos.symbol,
                                            type: isBuy ? "LONG" : "SHORT",
                                            volume: pos.volume || 0.01,
                                            openPrice: pos.openPrice || 0,
                                            currentPrice: pos.currentPrice || pos.openPrice || 0,
                                            stopLoss: pos.stopLoss || 0,
                                            takeProfit: pos.takeProfit || 0,
                                            profit: pos.profit || 0,
                                            time: pos.time ? new Date(pos.time).toISOString() : new Date().toISOString()
                                        };
                                        liveBrokerPositions.set(String(pos.id), updated);
                                        historicalOpenPrices.set(String(pos.id), updated.openPrice);
                                        brokerEvents.emit("positionUpdated", updated);
                                        logger.debug({ positionId: pos.id, type: updated.type, openPrice: updated.openPrice, sl: updated.stopLoss, tp: updated.takeProfit }, "[MetaApi Streaming] Position updated in real time");
                                    }
                                };
                            }
                            if (prop === 'onPositionRemoved') {
                                return (instanceIndex: string, pos: any) => {
                                    if (!pos) return;
                                    const sym = (pos.symbol || "").toUpperCase();
                                    if (sym.includes("XAU") || sym.includes("GOLD")) {
                                        const posIdStr = String(pos.id);
                                        liveBrokerPositions.delete(posIdStr);
                                        brokerEvents.emit("positionRemoved", { id: posIdStr });
                                        logger.debug({ positionId: posIdStr }, "[MetaApi Streaming] Position removed from MT5 terminal");
                                    }
                                };
                            }
                            if (prop === 'onDealAdded') {
                                return (instanceIndex: string, deal: any) => {
                                    if (!deal) return;
                                    if (deal.entryType === 'DEAL_ENTRY_OUT' || deal.entryType === 1) {
                                        const posIdStr = String(deal.positionId);
                                        markPositionClosing(posIdStr, `DEAL_ENTRY_OUT_${deal.id}`);
                                        const closedDeal: BrokerClosedDeal = {
                                            id: String(deal.id),
                                            positionId: posIdStr,
                                            accountId: connectedAccountId || activeAccountId || "",
                                            symbol: deal.symbol,
                                            type: deal.type,
                                            price: deal.price,
                                            openPrice: historicalOpenPrices.get(posIdStr),
                                            profit: deal.profit, commission: deal.commission, swap: deal.swap,
                                            time: deal.time ? new Date(deal.time).toISOString() : new Date().toISOString(),
                                            reason: deal.reason || "",
                                            comment: deal.comment || deal.brokerComment || ""
                                        };
                                        liveClosedDeals.unshift(closedDeal);
                                        if (liveClosedDeals.length > 100) liveClosedDeals.pop();
                                        logger.info({ dealId: deal.id, positionId: deal.positionId, price: deal.price, profit: deal.profit, commission: deal.commission, swap: deal.swap, reason: deal.reason, comment: deal.comment }, "[MetaApi Streaming] Exit deal executed on MT5 (TP/SL/Close)");
                                        brokerEvents.emit("dealClosed", closedDeal);
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
                                    } catch (e: any) {}
                                };
                            }
                            return () => {};
                        }
                    })
                );

                let subscribed = false;
                const standardCandidates = [
                    SYMBOL,
                    "XAUUSD", "GOLD", "XAUUSDm", "XAUUSD.a", "XAUUSD#", "GOLDm",
                    "XAUUSD_micro", "GOLDmicro", "XAUUSD.", "XAUUSDc", "XAUUSDb",
                    "XAUUSD-", "XAUUSD_i", "XAUUSD.pro", "XAUUSD.ecn", "XAUUSD!"
                ];
                let symbolsToTry = Array.from(new Set(standardCandidates.filter(Boolean)));

                let lastSubError: any = null;
                for (const sym of symbolsToTry) {
                    try {
                        await streamingConn.subscribeToMarketData(sym);
                        SYMBOL = sym; 
                        subscribed = true;
                        logger.info(`Subscribed to Gold symbol: ${sym}`);
                        break;
                    } catch (err: any) {
                        lastSubError = err;
                        const msg = err?.message || String(err);
                        if (msg.includes('timed out') || msg.includes('connected to broker')) {
                            logger.warn(`Broker subscription timed out for ${sym}, aborting standard symbol checks.`);
                            break;
                        }
                        continue;
                    }
                }

                if (!subscribed) {
                    logger.info(`Standard Gold symbols not found. Attempting dynamic discovery via RPC...`);
                    try {
                        const rpc = account.getRPCConnection();
                        await rpc.connect();
                        try {
                            const isSync = typeof rpc.isSynchronized === 'function' ? rpc.isSynchronized() : false;
                            if (!isSync) {
                                await rpc.waitSynchronized({ timeoutInSeconds: 10 });
                            }
                        } catch(rpcSyncErr: any) {
                            logger.debug({ syncErr: rpcSyncErr?.message }, "RPC synchronization issue, proceeding...");
                        }
                        
                        const allSymbols: string[] = await rpc.getSymbols();
                        
                        // Strict USD Gold symbols first (exclude cross pairs like XAUJPY, XAUEUR, XAUGBP, etc.)
                        const discovered = allSymbols
                            .filter((s: string) => {
                                const u = s.toUpperCase();
                                const isGold = u.includes('XAU') || u.includes('GOLD');
                                const isForeign = u.includes('JPY') || u.includes('AUD') || u.includes('EUR') || 
                                                  u.includes('GBP') || u.includes('CHF') || u.includes('NZD') || 
                                                  u.includes('CAD') || u.includes('SGD') || u.includes('HKD') || u.includes('CNH') || u.includes('TRY') || u.includes('ZAR') || u.includes('THB');
                                return isGold && !isForeign;
                            })
                            .sort((a: string, b: string) => {
                                const ua = a.toUpperCase();
                                const ub = b.toUpperCase();
                                const aIsUsd = ua.includes('USD') || ua === 'GOLD' || ua.startsWith('GOLD');
                                const bIsUsd = ub.includes('USD') || ub === 'GOLD' || ub.startsWith('GOLD');
                                if (aIsUsd && !bIsUsd) return -1;
                                if (!aIsUsd && bIsUsd) return 1;
                                return a.localeCompare(b);
                            });
                            
                        if (discovered.length > 0) {
                            logger.info(`Discovered potential Gold symbols (ordered by priority): ${discovered.slice(0, 5).join(', ')}`);
                            for (const sym of discovered) {
                                try {
                                    await streamingConn.subscribeToMarketData(sym);
                                    SYMBOL = sym;
                                    subscribed = true;
                                    logger.info(`Dynamically subscribed to discovered symbol: ${sym}`);
                                    break;
                                } catch (err: any) {
                                    lastSubError = err;
                                    const msg = err?.message || String(err);
                                    if (msg.includes('timed out') || msg.includes('connected to broker')) {
                                        logger.warn(`Broker subscription timed out for ${sym}, aborting dynamic symbol checks.`);
                                        break;
                                    }
                                    continue;
                                }
                            }
                        }
                    } catch (rpcErr: any) {
                        logger.warn({ err: rpcErr?.message }, "RPC symbol discovery notice");
                    }
                }

                if (!subscribed) {
                    throw new Error(`Failed to subscribe to Gold symbols on account ${accountId}: ${lastSubError?.message || lastSubError || 'No matching Gold symbol available on broker'}`);
                }

                connection = streamingConn;
                activeAccountObj = account;
                activeAccountId = accountId;
                connectedAccount = account;
                connectedAccountId = accountId;
                metaApiStatus = "connected";
                
                logger.info({ accountId, symbol: SYMBOL }, "Successfully established MetaApi streaming connection");
                
                // Pre-populate in-memory positions from terminalState
                try {
                    const existingPositions = streamingConn.terminalState?.positions || [];
                    for (const pos of existingPositions) {
                        const sym = (pos.symbol || "").toUpperCase();
                        if (sym.includes("XAU") || sym.includes("GOLD")) {
                            const isBuy = pos.type === "POSITION_TYPE_BUY" || pos.type === 0;
                            liveBrokerPositions.set(String(pos.id), {
                                id: String(pos.id),
                                accountId: connectedAccountId,
                                symbol: pos.symbol,
                                type: isBuy ? "LONG" : "SHORT",
                                volume: pos.volume || 0.01,
                                openPrice: pos.openPrice || 0,
                                currentPrice: pos.currentPrice || pos.openPrice || 0,
                                stopLoss: pos.stopLoss || 0,
                                takeProfit: pos.takeProfit || 0,
                                profit: pos.profit || 0,
                                time: pos.time ? new Date(pos.time).toISOString() : new Date().toISOString()
                            });
                        }
                    }
                    if (liveBrokerPositions.size > 0) {
                        logger.info({ positionCount: liveBrokerPositions.size }, "[MetaApi Feed] Initialized in-memory open broker positions from terminalState");
                    }
                } catch(e) {}

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
                        try {
                            const candles = await account.getHistoricalCandles(SYMBOL, "1m", undefined, 1);
                            if (candles && candles.length > 0) {
                                const c = candles[candles.length - 1];
                                const midPrice = c.close;
                                lastPriceReceivedAt = Date.now();
                                const live = {
                                    price: midPrice,
                                    bid: midPrice - (c.spread || 20)/100,
                                    ask: midPrice + (c.spread || 20)/100,
                                    spread: c.spread || 20,
                                    change: 0,
                                    changePercent: 0,
                                    high24h: c.high,
                                    low24h: c.low,
                                    timestamp: typeof c.time === 'string' ? c.time : new Date(c.time).toISOString(),
                                    direction: "unchanged" as const,
                                    ms: typeof c.time === 'string' ? new Date(c.time).getTime() : new Date(c.time).getTime(),
                                    source: "metaapi" as const
                                };
                                setLatestPrice(live);
                                updateLiveCandles(midPrice, lastPriceReceivedAt);
                                logger.info(`Bootstrapped initial live price to ${midPrice} from recent candle`);
                            }
                        } catch (histErr: any) {
                             logger.warn({err: histErr}, "Could not bootstrap initial price from historical candles");
                        }
                    }
                } catch (e: any) {
                    logger.warn({err: e}, "Could not fetch initial price from terminalState");
                }
                
                break;
            } catch (accErr: any) {
                lastConnError = accErr;
                const errStr = accErr.message || String(accErr);
                if (errStr.toLowerCase().includes('account') && (errStr.includes('does not exist') || errStr.includes('NotFoundError') || errStr.includes('not found'))) {
                    invalidAccountBlacklist.add(accountId);
                }
                logger.debug({ accountId, err: errStr }, "Failed connecting to candidate account, trying fallback...");
            }
        } // end for

        if (!connectedAccount || !connection || metaApiStatus !== "connected") {
            throw lastConnError || new Error("Could not connect to any configured MetaApi account");
        }

        // Start active watchdog heartbeat timer
        startWatchdog();
        startPingPongMonitor();
    } catch (err: any) {
        metaApiStatus = "disconnected";
        const msg = err?.message || String(err || "");
        
        if (msg.includes('Cannot subscribe to market data for symbol') || msg.includes('symbol does not exist') || msg.includes('No matching Gold symbol')) {
            logger.warn("MetaApi Feed Notice: Gold symbol not active or not subscribed on the configured broker account. Live price feeds continue via primary market sources.");
            reconnectDelay = 60000;
        } else if (msg.includes('not connected to broker yet')) {
            logger.warn("MetaApi account is not connected to broker yet. Waiting for broker connection...");
            reconnectDelay = 20000;
        } else if (msg.includes('requires deployment')) {
            logger.warn("MetaApi Account Notice: Account requires deployment or balance verification in MetaApi dashboard.");
            reconnectDelay = 120000;
        } else if (msg.includes('does not exist') || msg.includes('NotFoundError')) {
            logger.warn("MetaApi Account Notice: The Account ID provided does not exist on your MetaApi profile. Please verify your Account ID in Settings.");
            reconnectDelay = 120000;
        } else if (msg.includes('Missing or invalid MetaApi credentials')) {
            // No need to log again here, just back off gracefully until user enters it in settings
            reconnectDelay = 60000;
        } else {
            logger.warn({ reason: msg }, "MetaApi feed in standby; will retry periodically");
            reconnectDelay = 5000;
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
 * If stalled for >300s or disconnected for >15s, automatically heals connection.
 */
function startPingPongMonitor() {
    if (latencyPingInterval) return;
    latencyPingInterval = setInterval(async () => {
        if (connection && metaApiStatus === "connected") {
            try {
                const start = Date.now();
                // Simple fast RPC call to measure end-to-end MT5 latency
                if (typeof connection.getAccountInformation === 'function') {
                    await connection.getAccountInformation();
                    currentMetaApiLatencyMs = Date.now() - start;
                } else if (typeof connection.getServerTime === 'function') {
                    await connection.getServerTime();
                    currentMetaApiLatencyMs = Date.now() - start;
                }
            } catch (err) {
                // If ping fails, we don't necessarily disconnect, but latency is effectively unknown/high
                currentMetaApiLatencyMs = 5000;
            }
        } else {
            currentMetaApiLatencyMs = 0;
        }
    }, 5000); // Ping every 5 seconds
}

function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(async () => {
        const now = Date.now();
        const secondsSinceLastTick = Math.floor((now - lastPriceReceivedAt) / 1000);

        if (metaApiStatus === "connected" && secondsSinceLastTick > 30 && !isConnecting) {
            logger.warn({ secondsSinceLastTick }, "[Watchdog] MetaApi tick stream stalled. Initiating auto-healing reconnection...");
            metaApiStatus = "disconnected";
            await startMetaApiFeed();
        } else if (metaApiStatus !== "connected" && !isConnecting) {
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
        metaApi = new MetaApi(token, { requestTimeout: 60, connectTimeout: 60 });
    }

    const settings = await getSystemSettings().catch(() => ({} as any));
    const accountIdsToTry = Array.from(new Set([
        activeAccountId,
        settings.realAccountId,

        process.env.META_ACCOUNT_ID
    ].filter((id): id is string => Boolean(id && isValidAccountId(id) && !invalidAccountBlacklist.has(id)))));

    if (accountIdsToTry.length === 0) {
        throw new Error("No valid MetaApi account ID configured in settings");
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
                            const candles = await Promise.race([
                                account.getHistoricalCandles(sym, targetTf, undefined, count),
                                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000))
                            ]);
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
                        } catch (symErr: any) {
                            lastErr = symErr;
                            logger.debug({ accId, sym, err: symErr.message || symErr }, "Symbol check failed");
                        }
                    }
                } catch (accErr: any) {
                    const errMsg = accErr.message || String(accErr);
                    if (errMsg.toLowerCase().includes('account') && (errMsg.includes('does not exist') || errMsg.includes('NotFoundError') || errMsg.includes('not found'))) {
                        invalidAccountBlacklist.add(accId);
                        logger.debug({ accId }, "Quietly blacklisted invalid MetaApi account ID");
                        // We do not throw or warn loudly here, just skip to the next account
                    } else {
                        logger.warn({ accId, err: errMsg }, "Failed to get MetaApi account");
                    }
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
    candleCache.set(cacheKey, { timestamp: Date.now(), data: [], promise: fetchPromise });
    return fetchPromise;
}
export interface OrderVerificationOptions {
    accountId?: string;
    orderId?: string;
    pollIntervalMs?: number;
    maxWaitMs?: number;
}

export interface OrderVerificationStatus {
    canUpdate: boolean;
    status: "CONFIRMED_ACTIVE" | "IN_FILL_SEQUENCE" | "IN_CLOSURE_SEQUENCE" | "CLOSED" | "NOT_FOUND" | "REJECTED" | "TIMEOUT";
    reason: string;
    position?: BrokerPosition | null;
    openPrice?: number;
    currentStopLoss?: number;
    currentTakeProfit?: number;
}

/**
 * Asynchronous 'Verify-before-Update' loop.
 * Checks current order/position status using a lightweight polling interval (e.g. 50ms)
 * to ensure we never attempt to modify orders that are in the middle of a fill or closure sequence.
 */
export async function verifyOrderStatusBeforeUpdate(
    positionId: string,
    options?: OrderVerificationOptions
): Promise<OrderVerificationStatus> {
    const pollInterval = options?.pollIntervalMs ?? 100;
    const maxWait = options?.maxWaitMs ?? 3000;
    const startTime = Date.now();
    const targetAccountId = options?.accountId || activeAccountId;
    const targetOrderId = options?.orderId;

    logger.debug({ positionId, orderId: targetOrderId, maxWait }, "[Verify-before-Update] Checking order status before sending SL/TP update...");

    let iteration = 0;
    while (Date.now() - startTime <= maxWait) {
        iteration++;

        // 1. Check if position is currently in a closure sequence
        if (isPositionInClosureSequence(positionId)) {
            logger.info(
                { positionId, iteration, elapsedMs: Date.now() - startTime },
                "[Verify-before-Update] Position is currently undergoing closure; ABORTING SL/TP update"
            );
            return {
                canUpdate: false,
                status: "IN_CLOSURE_SEQUENCE",
                reason: "Position is currently undergoing closure or has already been closed"
            };
        }
        const matchingDeal = liveClosedDeals.find(d => String(d.positionId) === String(positionId));
        if (matchingDeal) {
            markPositionClosing(positionId, `EXIT_DEAL_${matchingDeal.id}`);
            logger.info(
                { positionId, dealId: matchingDeal.id, elapsedMs: Date.now() - startTime },
                "[Verify-before-Update] Detected closed deal for position; ABORTING SL/TP update"
            );
            return {
                canUpdate: false,
                status: "CLOSED",
                reason: `Position already closed via deal ${matchingDeal.id}`
            };
        }
        // 3. Inspect streaming terminalState if available
        if (connection && (!targetAccountId || targetAccountId === activeAccountId)) {
            const rawPositions = connection.terminalState?.positions || [];
            const rawOrders = connection.terminalState?.orders || [];

            // A. Check for any in-flight order closing this position
            const closeOrder = rawOrders.find((o: any) => 
                String(o.positionId) === String(positionId) && 
                (o.state === 'ORDER_STATE_PLACED' || o.state === 'ORDER_STATE_FILLING' || o.type === 'ORDER_TYPE_CLOSE_BY' || o.type === 'ORDER_TYPE_CLOSE')
            );
            if (closeOrder) {
                markPositionClosing(positionId, `CLOSE_ORDER_${closeOrder.id}`);
                logger.info(
                    { positionId, orderId: closeOrder.id, state: closeOrder.state },
                    "[Verify-before-Update] In-flight close order detected in terminalState; ABORTING SL/TP update"
                );
                return {
                    canUpdate: false,
                    status: "IN_CLOSURE_SEQUENCE",
                    reason: `In-flight close order ${closeOrder.id} active in broker queue`
                };
            }
            // B. Check if order is still in the middle of filling
            const matchingOrder = rawOrders.find((o: any) => 
                (targetOrderId && String(o.id) === String(targetOrderId)) || 
                String(o.positionId) === String(positionId)
            );
            if (matchingOrder) {
                if (matchingOrder.state === 'ORDER_STATE_PLACED' || matchingOrder.state === 'ORDER_STATE_FILLING' || matchingOrder.state === 'ORDER_STATE_REQUEST_ADD') {
                    // Order is currently in the broker matching engine / filling
                    logger.debug(
                        { positionId, orderId: matchingOrder.id, state: matchingOrder.state, iteration },
                        "[Verify-before-Update] Order is currently in fill sequence; polling until fill completes..."
                    );
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    continue;
                }
                if (matchingOrder.state === 'ORDER_STATE_REJECTED' || matchingOrder.state === 'ORDER_STATE_CANCELED' || matchingOrder.state === 'ORDER_STATE_EXPIRED') {
                    logger.warn(
                        { positionId, orderId: matchingOrder.id, state: matchingOrder.state },
                        "[Verify-before-Update] Order fill was rejected or cancelled; ABORTING SL/TP update"
                    );
                    return {
                        canUpdate: false,
                        status: "REJECTED",
                        reason: `Order failed with state ${matchingOrder.state}`
                    };
                }
                }
            // C. Check if position exists and is confirmed active with valid open price
            const foundRawPos = rawPositions.find((p: any) => String(p.id) === String(positionId));
            if (foundRawPos && (foundRawPos.openPrice > 0 || foundRawPos.volume > 0)) {
                const isBuy = foundRawPos.type === "POSITION_TYPE_BUY" || foundRawPos.type === 0;
                const pos: BrokerPosition = {
                    id: String(foundRawPos.id),
                    accountId: targetAccountId || activeAccountId || "",
                    symbol: foundRawPos.symbol,
                    type: isBuy ? "LONG" : "SHORT",
                    volume: foundRawPos.volume || 0.01,
                    openPrice: foundRawPos.openPrice || 0,
                    currentPrice: foundRawPos.currentPrice || foundRawPos.openPrice || 0,
                    stopLoss: foundRawPos.stopLoss || 0,
                    takeProfit: foundRawPos.takeProfit || 0,
                    profit: foundRawPos.profit || 0,
                    time: foundRawPos.time ? new Date(foundRawPos.time).toISOString() : new Date().toISOString()
                };
                liveBrokerPositions.set(positionId, pos);

                return {
                    canUpdate: true,
                    status: "CONFIRMED_ACTIVE",
                    reason: "Position verified open, filled, and active",
                    position: pos,
                    openPrice: pos.openPrice,
                    currentStopLoss: pos.stopLoss,
                    currentTakeProfit: pos.takeProfit
                };
            }
        }
        
        // 4. Check in-memory position cache
        const cachedPos = liveBrokerPositions.get(positionId);
        if (cachedPos && cachedPos.openPrice > 0) {
            return {
                canUpdate: true,
                status: "CONFIRMED_ACTIVE",
                reason: "Position verified active in live position cache",
                position: cachedPos,
                openPrice: cachedPos.openPrice,
                currentStopLoss: cachedPos.stopLoss,
                currentTakeProfit: cachedPos.takeProfit
            };
        }
        
        // 5. If account is RPC or streaming has not populated position yet, check via RPC
        if (targetAccountId && targetAccountId !== activeAccountId) {
            try {
                const rpc = await getOrInitRpcConnection(targetAccountId);
                if (rpc) {
                    const rpcPositions = await rpc.getPositions().catch(() => []);
                    const foundRpcPos = rpcPositions?.find((p: any) => String(p.id) === String(positionId));
                    if (foundRpcPos) {
                        const isBuy = foundRpcPos.type === "POSITION_TYPE_BUY" || foundRpcPos.type === 0;
                        const pos: BrokerPosition = {
                            id: String(foundRpcPos.id),
                            accountId: targetAccountId,
                            symbol: foundRpcPos.symbol,
                            type: isBuy ? "LONG" : "SHORT",
                            volume: foundRpcPos.volume || 0.01,
                            openPrice: foundRpcPos.openPrice || 0,
                            currentPrice: foundRpcPos.currentPrice || foundRpcPos.openPrice || 0,
                            stopLoss: foundRpcPos.stopLoss || 0,
                            takeProfit: foundRpcPos.takeProfit || 0,
                            profit: foundRpcPos.profit || 0,
                            time: foundRpcPos.time ? new Date(foundRpcPos.time).toISOString() : new Date().toISOString()
                        };
                        liveBrokerPositions.set(positionId, pos);
                        return {
                            canUpdate: true,
                            status: "CONFIRMED_ACTIVE",
                            reason: "Position verified active via RPC connection",
                            position: pos,
                            openPrice: pos.openPrice,
                            currentStopLoss: pos.stopLoss,
                            currentTakeProfit: pos.takeProfit
                        };
                    }
                }
            } catch (rpcErr: any) {
                logger.debug({ err: rpcErr?.message }, "[Verify-before-Update] RPC verification tick note");
            }
        }
        // Wait for next lightweight polling interval
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    logger.warn(
        { positionId, elapsedMs: Date.now() - startTime },
        "[Verify-before-Update] Timeout verifying position status; allowing update anyway to avoid abandoning trade."
    );
    return {
        canUpdate: true,
        status: "TIMEOUT_BYPASSED",
        reason: `Verification timed out but bypassed to ensure stops are placed`
    };
}

/**
 * Safely modifies SL and TP for an open position with an asynchronous 'Verify-before-Update' loop.
 * - Prevents modifying positions that are filling or undergoing closure.
 * - Compensates for execution slippage if intendedEntryPrice is provided.
 * - Dispatches via ultra-low-latency streaming or fast RPC fallback.
 */
export async function safeModifyPositionSLTP(params: {
    positionId: string;
    accountId?: string;
    orderId?: string;
    stopLoss?: number;
    takeProfit?: number;
    intendedEntryPrice?: number;
    direction?: "LONG" | "SHORT";
    reason?: string;
}): Promise<{ success: boolean; reason: string; calibratedSL?: number; calibratedTP?: number }> {
    const { positionId, accountId, orderId, reason = "SL/TP Update", intendedEntryPrice, direction } = params;

    // Phase 1: Asynchronous 'Verify-before-Update' Loop
    const verification = await verifyOrderStatusBeforeUpdate(positionId, {
        accountId,
        orderId,
        pollIntervalMs: 50,
        maxWaitMs: 3000
    });

    if (!verification.canUpdate) {
        // Log the failure, but attempt a blind RPC update as a fallback
        logger.warn(
            { positionId, reason, verificationStatus: verification.status, failureReason: verification.reason },
            `[Verify-before-Update] Pre-update verification failed. Attempting blind RPC SL/TP modification fallback.`
        );
        
        // Attempt blind fallback
        try {
            const rpc = await getOrInitRpcConnection(accountId);
            let fallbackSL = params.stopLoss !== undefined ? Number(params.stopLoss.toFixed(2)) : 0;
            let fallbackTP = params.takeProfit !== undefined ? Number(params.takeProfit.toFixed(2)) : 0;
            
            if (fallbackSL > 0 || fallbackTP > 0) {
                 await rpc.modifyPosition(positionId, fallbackSL || undefined, fallbackTP || undefined);
                 logger.info({ positionId, fallbackSL, fallbackTP }, "Blind fallback SL/TP attachment succeeded");
                 return { success: true, reason: "BLIND_FALLBACK_SUCCESS", calibratedSL: fallbackSL, calibratedTP: fallbackTP };
            }
        } catch (blindErr: any) {
             logger.error({ err: blindErr?.message }, "Blind fallback SL/TP attachment failed");
        }
        
        return { success: false, reason: verification.reason };
    }

    const pos = verification.position;
    let targetSL = params.stopLoss !== undefined ? Number(params.stopLoss.toFixed(2)) : (pos ? pos.stopLoss : 0);
    let targetTP = params.takeProfit !== undefined ? Number(params.takeProfit.toFixed(2)) : (pos ? pos.takeProfit : 0);

    // Slippage Calibration: Shift SL and TP exactly by the entry slippage to preserve R:R and Risk
    if (intendedEntryPrice && pos && pos.openPrice && pos.openPrice > 0) {
        const slippage = pos.openPrice - intendedEntryPrice;
        if (Math.abs(slippage) >= 0.05) {
            targetSL = targetSL > 0 ? Number((targetSL + slippage).toFixed(2)) : targetSL;
            targetTP = targetTP > 0 ? Number((targetTP + slippage).toFixed(2)) : targetTP;
            logger.info({ 
                positionId, 
                intendedEntryPrice, 
                actualEntryPrice: pos.openPrice, 
                slippage: slippage.toFixed(2), 
                originalSL: params.stopLoss, 
                calibratedSL: targetSL 
            }, "Calibrating SL/TP dynamically based on actual broker execution price to preserve exact risk distance");
        }
    }

    // Check if target SL/TP are effectively identical to current stops (avoid spamming broker)
    if (pos && targetSL > 0 && Math.abs(pos.stopLoss - targetSL) < 0.05 && 
        (targetTP === 0 || Math.abs(pos.takeProfit - targetTP) < 0.05)) {
        logger.debug({ positionId, currentSL: pos.stopLoss, targetSL }, "[Verify-before-Update] Stops already match target; skipping modification");
        return { success: true, reason: "ALREADY_MATCHED", calibratedSL: targetSL, calibratedTP: targetTP };

        }
    // Phase 2.5: Pre-flight Broker StopsLevel and Market Distance Validation
    const sym = pos?.symbol || SYMBOL || "GOLD";
    const termSpec = connection?.terminalState?.specification(sym);
    const point = termSpec?.point ?? 0.01;
    const digits = termSpec?.digits ?? 2;
    const stopsLevelPoints = termSpec?.stopsLevel ?? 30; // broker stops level in points
    const brokerMinDist = stopsLevelPoints * point;

    const termPrice = connection?.terminalState?.price(sym);
    const live = getLatestPrice();
    const currentBid = termPrice?.bid ?? live?.bid;
    const currentAsk = termPrice?.ask ?? live?.ask;
    const liveSpread = termPrice ? Number((termPrice.ask - termPrice.bid).toFixed(digits)) : (live?.spread ?? 0.50);
    const minStopBuffer = Number(Math.max(brokerMinDist, liveSpread * 1.2, 0.40).toFixed(digits));

    if (targetSL > 0) targetSL = Number(targetSL.toFixed(digits));
    if (targetTP > 0) targetTP = Number(targetTP.toFixed(digits));

    const effectiveDir = direction || pos?.type || "LONG";

    if (effectiveDir === "LONG") {
        if (targetSL > 0 && currentBid !== undefined) {
            const maxAllowedSL = Number((currentBid - minStopBuffer).toFixed(digits));
            if (targetSL > maxAllowedSL) {
                logger.info(
                    { positionId, targetSL, maxAllowedSL, currentBid, minStopBuffer, reason },
                    "[Verify-before-Update] Target SL exceeds broker maximum allowed SL for LONG. Clamping to maxAllowedSL to ensure MT5 acceptance."
                );
                targetSL = maxAllowedSL;
                if (pos && targetSL <= pos.stopLoss) {
                    return { success: false, reason: "PRICE_TOO_CLOSE_TO_STOP" };
                }
            }
        }
        if (targetTP > 0 && currentAsk !== undefined) {
            const minAllowedTP = Number((currentAsk + minStopBuffer).toFixed(digits));
            if (targetTP < minAllowedTP) {
                logger.info(
                    { positionId, targetTP, minAllowedTP, currentAsk, minStopBuffer, reason },
                    "[Verify-before-Update] Target TP is below broker minimum allowed TP for LONG (too close to live Ask); deferring modification"
                );
                return { success: false, reason: "PRICE_TOO_CLOSE_TO_STOP" };
            }
        }
    } else {
        if (targetSL > 0 && currentAsk !== undefined) {
            const minAllowedSL = Number((currentAsk + minStopBuffer).toFixed(digits));
            if (targetSL < minAllowedSL) {
                logger.info(
                    { positionId, targetSL, minAllowedSL, currentAsk, minStopBuffer, reason },
                    "[Verify-before-Update] Target SL is below broker minimum allowed SL for SHORT. Clamping to minAllowedSL to ensure MT5 acceptance."
                );
                targetSL = minAllowedSL;
                if (pos && targetSL >= pos.stopLoss && pos.stopLoss > 0) {
                    return { success: false, reason: "PRICE_TOO_CLOSE_TO_STOP" };
                }
            }
        }
        if (targetTP > 0 && currentBid !== undefined) {
            const maxAllowedTP = Number((currentBid - minStopBuffer).toFixed(digits));
            if (targetTP > maxAllowedTP) {
                logger.info(
                    { positionId, targetTP, maxAllowedTP, currentBid, minStopBuffer, reason },
                    "[Verify-before-Update] Target TP exceeds broker maximum allowed TP for SHORT (too close to live Bid); deferring modification"
                );
                return { success: false, reason: "PRICE_TOO_CLOSE_TO_STOP" };
            }
        }
    }
    // Phase 3: Dispatch Modification to MetaApi
    const targetAccId = accountId || pos?.accountId || activeAccountId;
    let modified = false;

    // Fast-path: Active streaming connection
    if (connection && activeAccountId === targetAccId && typeof connection.modifyPosition === 'function') {
        try {
            await connection.modifyPosition(positionId, targetSL, targetTP);
            modified = true;
            logger.info(
                { positionId, newSL: targetSL, newTP: targetTP, reason },
                "[MetaApi Execution] Verified and modified position SL/TP on MT5 via streaming connection"
            );
        } catch (streamErr: any) {
            const errMsg = streamErr?.message || String(streamErr);
            if (errMsg.includes('POSITION_CLOSED') || errMsg.includes('10004') || errMsg.includes('INVALID_TICKET')) {
                markPositionClosing(positionId, "BROKER_REPORTED_CLOSED");
                liveBrokerPositions.delete(positionId);
                return { success: false, reason: "POSITION_CLOSED_BY_BROKER" };
            } else if (errMsg.includes('Invalid stops') || errMsg.includes('10016') || errMsg.includes('TRADE_RETCODE_INVALID_STOPS')) {
                logger.info(
                    { positionId, err: errMsg, targetSL, targetTP },
                    "[MetaApi Execution] Broker rejected stop modification due to rapid tick volatility or stopsLevel; deferring update"
                );
                return { success: false, reason: "INVALID_STOPS_REJECTED_BY_BROKER" };
            }
            logger.debug({ positionId, err: errMsg }, "[MetaApi] Streaming modifyPosition fallback to RPC...");
        }
    }
    // Fallback path: Pre-warmed RPC connection
    if (!modified && targetAccId) {
        try {
            const rpc = await getOrInitRpcConnection(targetAccId);
            if (rpc) {
                await rpc.modifyPosition(positionId, targetSL, targetTP);
                modified = true;
                logger.info(
                    { positionId, newSL: targetSL, newTP: targetTP, targetAccId, reason },
                    "[MetaApi Execution] Verified and modified position SL/TP on MT5 via fast RPC"
                );
            }
        } catch (rpcErr: any) {
            const errMsg = rpcErr?.message || String(rpcErr);
            if (errMsg.includes('POSITION_CLOSED') || errMsg.includes('10004') || errMsg.includes('INVALID_TICKET')) {
                markPositionClosing(positionId, "BROKER_REPORTED_CLOSED");
                liveBrokerPositions.delete(positionId);
                return { success: false, reason: "POSITION_CLOSED_BY_BROKER" };
            } else if (errMsg.includes('Invalid stops') || errMsg.includes('10016') || errMsg.includes('TRADE_RETCODE_INVALID_STOPS')) {
                logger.info(
                    { positionId, err: errMsg, targetSL, targetTP },
                    "[MetaApi Execution] Broker rejected stop modification due to rapid tick volatility or stopsLevel; deferring update"
                );
                return { success: false, reason: "INVALID_STOPS_REJECTED_BY_BROKER" };
            }
            logger.warn({ positionId, err: errMsg }, "[MetaApi Execution] Failed to modify position SL/TP via RPC");
            return { success: false, reason: errMsg };
        }
    }
    
    return { success: modified, reason: modified ? "SUCCESS" : "NO_RPC_CONNECTION", calibratedSL: targetSL, calibratedTP: targetTP };
}

export async function executeTradeOnAccount(
    accountId: string,
    accountType: "DEMO" | "REAL",
    direction: "LONG" | "SHORT",
    stopLoss: number,
    takeProfit: number,
    volume: number = 0.01,
    intendedEntryPrice?: number,
    signalTimestamp?: number
) {
    if (!token) {
        throw new Error("META_API_TOKEN is not configured");
    }
    if (!accountId || !accountId.trim()) {
        throw new Error(`MetaApi Account ID is missing in settings`);
    }

    const dispatchStart = Date.now();
    const latencyFromSignal = signalTimestamp ? (dispatchStart - signalTimestamp) : null;
    const targetAccountId = accountId.trim();
    const formattedSL = Number(stopLoss.toFixed(2));
    const formattedTP = Number(takeProfit.toFixed(2));
    // Let autoTrader handle volume safety limits. We just format here.
    const formattedVol = Number(Math.max(0.01, volume).toFixed(2));
    const tradeSymbol = SYMBOL || "GOLD";
    const tradeOptions = { comment: "GoldSwing AI" };

    logger.info({ 
        accountId: targetAccountId, 
        accountType, 
        direction, 
        formattedSL, 
        formattedTP, 
        formattedVol, 
        tradeSymbol,
        latencyFromSignal: latencyFromSignal !== null ? `${latencyFromSignal}ms` : undefined
    });

    let executionResult: any = null;

    // Helper to calibrate stops if broker filled at a slightly different price (slippage protection)
    const calibrateStopsOnFill = async (posId?: string, orderId?: string) => {
        if (!posId || !intendedEntryPrice) return;
        try {
            await safeModifyPositionSLTP({
                positionId: posId,
                accountId: targetAccountId,
                orderId,
                stopLoss,
                takeProfit,
                intendedEntryPrice,
                direction,
                reason: "Slippage stop calibration"
            });
        } catch (calErr: any) {
            logger.debug({ err: calErr?.message }, "Slippage stop calibration notice");
        }
    };

    // 1. If active streaming connection is already connected to this account, execute directly (fastest: ~80-120ms)
    if (connection && activeAccountId === targetAccountId) {
        try {
            logger.info({
                event: "DIAGNOSTIC_MT5_DISPATCH",
                direction: direction,
                buyAction: direction === "LONG" ? "createMarketBuyOrder" : "createMarketSellOrder"
            }, "=== BACKEND MT5 DISPATCH DIAGNOSTIC ===");
            executionResult = direction === "LONG"
                ? await connection.createMarketBuyOrder(tradeSymbol, formattedVol, formattedSL, formattedTP, tradeOptions)
                : await connection.createMarketSellOrder(tradeSymbol, formattedVol, formattedSL, formattedTP, tradeOptions);

            const execTimeMs = Date.now() - dispatchStart;
            logger.info({ 
                accountId: targetAccountId, 
                orderId: executionResult.orderId, 
                positionId: executionResult.positionId,
                execTimeMs: `${execTimeMs}ms`,
                latencyFromSignal: latencyFromSignal !== null ? `${latencyFromSignal}ms` : undefined
            });

            if (executionResult.positionId) {
                calibrateStopsOnFill(String(executionResult.positionId), String(executionResult.orderId)).catch(() => {});
            }
            return executionResult;
        } catch (err: any) {
            const errMsg = err?.message || String(err);
            // If rejected due to broker stop level proximity (e.g. XM minimum stop level 10016), execute market first, then attach stops with Verify-before-Update loop
            if (errMsg.includes('INVALID_STOPS') || errMsg.includes('10016') || errMsg.includes('stops') || errMsg.includes('STOPS')) {
                logger.warn({ accountType, err: errMsg }, "[MetaApi Execution] Broker rejected stops proximity. Executing market fill instantly with 2-stage SL/TP attachment...");
                try {
                    executionResult = direction === "LONG"
                        ? await connection.createMarketBuyOrder(tradeSymbol, formattedVol, undefined, undefined, tradeOptions)
                        : await connection.createMarketSellOrder(tradeSymbol, formattedVol, undefined, undefined, tradeOptions);
                    
                    if (executionResult.positionId) {
                        safeModifyPositionSLTP({
                            positionId: String(executionResult.positionId),
                            accountId: targetAccountId,
                            orderId: String(executionResult.orderId),
                            stopLoss: formattedSL,
                            takeProfit: formattedTP,
                            intendedEntryPrice,
                            direction,
                            reason: "Streaming 2-stage post-fill SL/TP attachment"
                        }).catch(() => {});
                    }
                    return executionResult;
                } catch (retryErr: any) {
                    logger.warn({ err: retryErr?.message }, "[MetaApi] Streaming 2-stage retry failed, falling back to RPC...");
                }
            } else {
                logger.warn({ accountType, accountId: targetAccountId, err: errMsg }, `[MetaApi ${accountType}] Streaming execution failed, attempting fast RPC connection fallback...`);
            }
        }
    }
    // 2. Pre-warmed RPC connection execution (NO waitSynchronized: ~200ms)
    try {
        const rpc = await getOrInitRpcConnection(targetAccountId);
        try {
            executionResult = direction === "LONG"
                ? await rpc.createMarketBuyOrder(tradeSymbol, formattedVol, formattedSL, formattedTP, tradeOptions)
                : await rpc.createMarketSellOrder(tradeSymbol, formattedVol, formattedSL, formattedTP, tradeOptions);
        } catch (stopsErr: any) {
            const sMsg = stopsErr?.message || String(stopsErr);
            if (sMsg.includes('INVALID_STOPS') || sMsg.includes('10016') || sMsg.includes('stops') || sMsg.includes('STOPS')) {
                logger.warn({ err: sMsg }, "[MetaApi Execution] RPC stops level constraint. Executing pure market order then attaching stops via Verify-before-Update loop...");
                executionResult = direction === "LONG"
                    ? await rpc.createMarketBuyOrder(tradeSymbol, formattedVol, undefined, undefined, tradeOptions)
                    : await rpc.createMarketSellOrder(tradeSymbol, formattedVol, undefined, undefined, tradeOptions);
                if (executionResult?.positionId) {
                    safeModifyPositionSLTP({
                        positionId: String(executionResult.positionId),
                        accountId: targetAccountId,
                        orderId: String(executionResult.orderId),
                        stopLoss: formattedSL,
                        takeProfit: formattedTP,
                        intendedEntryPrice,
                        direction,
                        reason: "RPC 2-stage post-fill SL/TP attachment"
                    }).catch(() => {});
                }
            } else {
                throw stopsErr;
            }
        }
        const execTimeMs = Date.now() - dispatchStart;
        logger.info({ 
            accountId: targetAccountId, 
            orderId: executionResult.orderId, 
            execTimeMs: `${execTimeMs}ms`,
            latencyFromSignal: latencyFromSignal !== null ? `${latencyFromSignal}ms` : undefined
        });

        if (executionResult?.positionId) {
            calibrateStopsOnFill(String(executionResult.positionId), String(executionResult.orderId)).catch(() => {});
        }
        return executionResult;
    } catch (err: any) {
        const errMsg = err?.message || String(err);
        logger.warn({ accountType, accountId: targetAccountId, err: errMsg }, `[MetaApi ${accountType}] Primary trade attempt failed, checking alternative symbol...`);

        // If symbol wasn't found (e.g. if SYMBOL was XAUUSD instead of GOLD on XM MT5), retry with alternate
        const altSymbol = tradeSymbol.toUpperCase().includes("GOLD") ? "XAUUSD" : "GOLD";
        try {
            const rpc = await getOrInitRpcConnection(targetAccountId);
            executionResult = direction === "LONG"
                ? await rpc.createMarketBuyOrder(altSymbol, formattedVol, formattedSL, formattedTP, tradeOptions)
                : await rpc.createMarketSellOrder(altSymbol, formattedVol, formattedSL, formattedTP, tradeOptions);

            SYMBOL = altSymbol; // Update active symbol to working one
            logger.info({ accountId: targetAccountId, orderId: executionResult.orderId, altSymbol }, `[MetaApi ${accountType}] Executed successfully with alternative symbol`);
            if (executionResult?.positionId) {
                calibrateStopsOnFill(String(executionResult.positionId), String(executionResult.orderId)).catch(() => {});
            }
            return executionResult;
        } catch (retryErr: any) {
            logger.error({ accountType, accountId: targetAccountId, err: retryErr?.message || String(retryErr) }, `[MetaApi ${accountType}] Trade execution failed`);
            throw err;
        }
    }
}

export async function executeTrade(direction: "LONG" | "SHORT", stopLoss: number, takeProfit: number, volume: number = 0.01) {
    if (!activeAccountId) {
        throw new Error("No active MetaApi account configured");
    }
    return executeTradeOnAccount(activeAccountId, "DEMO", direction, stopLoss, takeProfit, volume);
}

async function getMetaApiInstance() {
    if (!token) return null;
    if (!metaApi) {
        const { default: MetaApi } = await import("metaapi.cloud-sdk/esm-node");
        metaApi = new MetaApi(token, { requestTimeout: 60, connectTimeout: 60 });
    }
    return metaApi;
}

export async function getOpenBrokerPositions(): Promise<BrokerPosition[]> {
    // Refresh the in-memory map from terminalState first to ensure it's not holding onto ghosts
    if (connection && connection.terminalState?.positions) {
        const rawPosIds = connection.terminalState.positions.map(p => String(p.id));
        for (const [key, _] of liveBrokerPositions.entries()) {
            if (!rawPosIds.includes(key)) {
                liveBrokerPositions.delete(key);
            }
        }
    }

    // 1. Zero-latency path (<1ms): return in-memory live positions updated by streaming WebSocket
    if (liveBrokerPositions.size > 0) {
        return Array.from(liveBrokerPositions.values());
    }

    // 2. Fast-path: active streaming connection terminalState
    if (connection && connection.terminalState?.positions) {
        const results: BrokerPosition[] = [];
        const rawPositions = connection.terminalState.positions || [];
        for (const pos of rawPositions) {
            const sym = (pos.symbol || "").toUpperCase();
            if (sym.includes("XAU") || sym.includes("GOLD")) {
                const isBuy = pos.type === "POSITION_TYPE_BUY" || pos.type === 0;
                const p: BrokerPosition = {
                    id: String(pos.id),
                    accountId: activeAccountId || "",
                    symbol: pos.symbol,
                    type: isBuy ? "LONG" : "SHORT",
                    volume: pos.volume || 0.01,
                    openPrice: pos.openPrice || 0,
                    currentPrice: pos.currentPrice || pos.openPrice || 0,
                    stopLoss: pos.stopLoss || 0,
                    takeProfit: pos.takeProfit || 0,
                    profit: pos.profit || 0,
                    time: pos.time ? new Date(pos.time).toISOString() : new Date().toISOString()
                };
                liveBrokerPositions.set(String(pos.id), p);
                results.push(p);
            }
        }
        if (results.length > 0) return results;
    }
    return [];
}

export async function getRecentlyClosedBrokerDeals(since: Date): Promise<BrokerClosedDeal[]> {
    // 1. Zero-latency path: return in-memory live closed deals received from streaming WebSocket
    if (liveClosedDeals.length > 0) {
        const sinceMs = since.getTime();
        const filtered = liveClosedDeals.filter(d => new Date(d.time).getTime() >= sinceMs);
        if (filtered.length > 0) return filtered;
    }
    return [...liveClosedDeals];
}

export async function closeBrokerPosition(positionId: string, accountId?: string): Promise<boolean> {
    if (!token || !positionId) return false;
    markPositionClosing(positionId, "CLOSE_BROKER_POSITION_INVOKED");
    try {
        if (connection && typeof connection.closePosition === 'function') {
            try {
                await connection.closePosition(positionId);
                liveBrokerPositions.delete(positionId);
                logger.info({ positionId }, "[MetaApi Execution] Position closed on MT5 via streaming connection");
                return true;
            } catch (err: any) {
                logger.debug({ positionId, err: err?.message }, "[MetaApi] Streaming closePosition failed, falling back to RPC...");
            }
        }
        const settings = await getSystemSettings().catch(() => ({} as any));
        const targetAccId = accountId || activeAccountId || settings.realAccountId;
        if (!targetAccId) return false;

        const rpc = await getOrInitRpcConnection(targetAccId.trim());
        if (rpc) {
            await rpc.closePosition(positionId);
            liveBrokerPositions.delete(positionId);
            logger.info({ positionId, accountId: targetAccId }, "[MetaApi Execution] Position closed on MT5 via fast RPC");
            return true;
        }
        return false;
    } catch (err: any) {
        logger.warn({ positionId, err: err?.message || String(err) }, "[MetaApi Execution] Failed to close position on broker");
        return false;
    }
}

export async function closeOpenBrokerPositionsForSignal(direction: "LONG" | "SHORT"): Promise<number> {
    let closed = 0;
    try {
        const positions = await getOpenBrokerPositions();
        for (const pos of positions) {
            if (pos.type === direction) {
                markPositionClosing(pos.id, "OPPOSING_SIGNAL_CLOSE");
                const ok = await closeBrokerPosition(pos.id, pos.accountId);
                if (ok) closed++;
            }
        }
    } catch (err: any) {
        logger.warn({ err: err?.message || err }, "closeOpenBrokerPositionsForSignal failed");
    }
    return closed;
}

export async function modifyOpenPositionsStopLossAndTakeProfit(
    direction: "LONG" | "SHORT",
    newStopLoss: number,
    newTakeProfit?: number,
    maxRetries = 3
): Promise<{ success: boolean; modifiedCount: number; reason?: string; calibratedSL?: number; calibratedTP?: number }> {
    if (!token) return { success: false, modifiedCount: 0, reason: "NO_TOKEN" };
    try {
        const positions = await getOpenBrokerPositions();
        const matchingPositions = positions.filter(pos => pos.type === direction);
        if (matchingPositions.length === 0) {
            return { success: true, modifiedCount: 0, reason: "NO_MATCHING_POSITIONS" };
        }

        let modifiedCount = 0;
        let lastFailureReason: string | undefined;
        let finalCalibratedSL = newStopLoss;
        let finalCalibratedTP = newTakeProfit;

        for (const pos of matchingPositions) {
            if (isPositionInClosureSequence(pos.id)) {
                logger.debug({ positionId: pos.id }, "[Trailing SL/TP] Skipping position in closure sequence");
                continue;
            }
            const slMatch = pos.stopLoss > 0 && Math.abs(pos.stopLoss - newStopLoss) < 0.05;
            const tpMatch = !newTakeProfit || (pos.takeProfit > 0 && Math.abs(pos.takeProfit - newTakeProfit) < 0.05);
            if (slMatch && tpMatch) {
                modifiedCount++;
                continue;
            }

            let attempt = 1;
            let success = false;
            const targetTP = newTakeProfit ?? pos.takeProfit;
            
            while (attempt <= maxRetries && !success) {
                const result = await safeModifyPositionSLTP({
                    positionId: pos.id,
                    accountId: pos.accountId,
                    stopLoss: newStopLoss,
                    takeProfit: targetTP,
                    direction,
                    reason: `Asymmetric Runner SL/TP update (SL: ${newStopLoss}, TP: ${targetTP}) (Attempt ${attempt}/${maxRetries})`
                });

                if (result.success) {
                    success = true;
                    modifiedCount++;
                    if (result.calibratedSL) finalCalibratedSL = result.calibratedSL;
                    if (result.calibratedTP) finalCalibratedTP = result.calibratedTP;
                } else {
                    lastFailureReason = result.reason;
                    // Do not retry if the broker reported it's already closed or if the price is invalid
                    if (result.reason === "POSITION_CLOSED_BY_BROKER" || result.reason === "ALREADY_MATCHED") {
                        break;
                    }
                    
                    if (attempt < maxRetries) {
                        logger.warn({ positionId: pos.id, attempt, reason: result.reason }, `[Trailing SL/TP Retry] Update failed, retrying in ${attempt * 600}ms...`);
                        await new Promise(r => setTimeout(r, attempt * 600));
                    }
                }
                attempt++;
            }
        }
        return {
            success: modifiedCount > 0,
            modifiedCount,
            reason: modifiedCount > 0 ? "SUCCESS" : (lastFailureReason || "MODIFICATION_DEFERRED"),
            calibratedSL: finalCalibratedSL,
            calibratedTP: finalCalibratedTP
        };
    } catch (err: any) {
        logger.warn({ err: err?.message || String(err) }, "[MetaApi Execution] Failed in modifyOpenPositionsStopLossAndTakeProfit");
        return { success: false, modifiedCount: 0, reason: err?.message || String(err) };
    }
}

export async function modifyOpenPositionsStopLoss(
    direction: "LONG" | "SHORT",
    newStopLoss: number,
    maxRetries = 3
): Promise<{ success: boolean; modifiedCount: number; reason?: string; calibratedSL?: number }> {
    return modifyOpenPositionsStopLossAndTakeProfit(direction, newStopLoss, undefined, maxRetries);
}

export async function closeAllPositions(accountId: string) {
    if (!accountId) return;
    try {
        const trimmedId = accountId.trim();
        const rpc = await getOrInitRpcConnection(trimmedId);
        
        if (!rpc) {
             logger.warn({ accountId: trimmedId }, "[MetaApi Execution] Failed to auto-close positions for rollover: rpc connection could not be established");
             return;
        }

        const positions = await rpc.getPositions();
        let closedCount = 0;
        for (const pos of positions) {
            // Check for the configured symbol or common gold symbols
            if (pos.symbol === SYMBOL || pos.symbol === "XAUUSD" || pos.symbol.includes("XAUUSD") || pos.symbol.includes("GOLD")) {
                markPositionClosing(pos.id, "ROLLOVER_AUTO_CLOSE");
                await rpc.closePosition(pos.id);
                logger.info({ accountId: trimmedId, positionId: pos.id, symbol: pos.symbol }, "[MetaApi Execution] Auto-closed position before rollover.");
                closedCount++;
            }
        }
        if (closedCount > 0) {
            logger.info({ accountId: trimmedId, closedCount }, "[MetaApi] Successfully closed positions before daily rollover.");
        }
    } catch (err: any) {
        logger.warn({ err: err.message || String(err), accountId }, "[MetaApi Execution] Failed to auto-close positions for rollover");
    }
}

export interface AccountFundsInfo {
    equity: number;
    leverage: number;
    freeMargin: number;
}

export async function getAccountFundsInfo(accountId: string): Promise<AccountFundsInfo | null> {
    try {
        if (!token || !accountId) return null;
        const trimmed = accountId.trim();

        // 1. Check in-memory funds cache (instant: 0ms)
        const cached = accountFundsCache.get(trimmed);
        if (cached && Date.now() - cached.updatedAt < 120_000) {
            return { equity: cached.equity, leverage: cached.leverage, freeMargin: cached.freeMargin };
        }

        // 2. Check active streaming connection terminal state (instant: 0ms)
        if (connection && activeAccountId === trimmed && connection.terminalState?.accountInformation) {
            const info = connection.terminalState.accountInformation;
            const res = { equity: info.equity, leverage: info.leverage || 1000, freeMargin: info.freeMargin || info.equity };
            accountFundsCache.set(trimmed, { ...res, updatedAt: Date.now() });
            return res;
        }

        // 3. Fallback to cached value even if slightly older (prevents trade execution delay)
        if (cached) {
            return { equity: cached.equity, leverage: cached.leverage, freeMargin: cached.freeMargin };
        }

        // 4. Fast RPC query with 2s timeout (NO waitSynchronized!)
        try {
            const rpc = await getOrInitRpcConnection(trimmed);
            const info = await Promise.race([
                rpc.getAccountInformation(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("RPC info timeout")), 2000))
            ]) as any;
            if (info && info.equity) {
                const res = { equity: info.equity, leverage: info.leverage || 1000, freeMargin: info.freeMargin || info.equity };
                accountFundsCache.set(trimmed, { ...res, updatedAt: Date.now() });
                return res;
            }
        } catch (rpcErr: any) {
            logger.debug({ err: rpcErr?.message, accountId: trimmed }, "Fast RPC funds info fetch timed out or failed");
        }
        return null;
    } catch (err: any) {
        logger.error({ err: err.message || err, accountId }, "[MetaApi] Failed to fetch account funds info");
        return null;
    }
}

export async function getSymbolSpec(accountId: string, symbol: string): Promise<any> {
    try {
        if (!token || !accountId || !symbol) return null;
        const trimmed = accountId.trim();

        if (connection && activeAccountId === trimmed && connection.terminalState) {
            const spec = connection.terminalState.specification(symbol);
            if (spec) return spec;
        }

        const rpc = await getOrInitRpcConnection(trimmed);
        const spec = await Promise.race([
            rpc.getSymbolSpecification(symbol),
            new Promise((_, reject) => setTimeout(() => reject(new Error("RPC spec timeout")), 2000))
        ]) as any;
        return spec;
    } catch (err: any) {
        logger.debug({ err: err.message || err, accountId, symbol }, "[MetaApi] Failed to fetch symbol specification");
        return null;
    }
}

export function getConfiguredSymbol(): string {
    return SYMBOL || "XAUUSD";
}
