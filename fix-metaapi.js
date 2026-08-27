const fs = require('fs');
const file = 'artifacts/api-server/src/lib/metaApiFeed.ts';
let content = fs.readFileSync(file, 'utf8');

const targetFunc = `export async function getMetaApiHistoricalOHLC(timeframe: string, count: number): Promise<OHLCCandle[]> {
    if (!metaApi || !accountId) throw new Error("MetaApi connection not established");
    
    const metaApiTimeframes: Record<string, string> = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "1h": "1h",
        "4h": "4h",
        "1d": "1d",
    };
    const tf = metaApiTimeframes[timeframe] || "1h";
    
    // Fallback to historyStorage if needed or RPC connection
    try {
        const account = await metaApi.metatraderAccountApi.getAccount(accountId);
        const candles = await account.getHistoricalCandles(SYMBOL, tf, undefined, count);
        
        return candles.map((c: any) => ({
            time: Math.floor(new Date(c.time).getTime() / 1000),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.tickVolume || c.volume || 0
        }));
    } catch (err) {
        logger.error({ err }, "Failed to fetch historical candles from MetaApi");
        throw err;
    }
}`;

const replacementFunc = `const candleCache = new Map<string, { timestamp: number, data: OHLCCandle[], promise?: Promise<OHLCCandle[]> }>();

export async function getMetaApiHistoricalOHLC(timeframe: string, count: number): Promise<OHLCCandle[]> {
    if (!metaApi || !accountId) throw new Error("MetaApi connection not established");
    
    const metaApiTimeframes: Record<string, string> = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "1h": "1h",
        "4h": "4h",
        "1d": "1d",
    };
    const tf = metaApiTimeframes[timeframe] || "1h";
    
    const cacheKey = \`\${tf}-\${count}\`;
    const now = Date.now();
    const cached = candleCache.get(cacheKey);

    // Cache hit and less than 15 seconds old
    if (cached && (now - cached.timestamp < 15000)) {
        if (cached.promise) return cached.promise;
        return cached.data;
    }
    // If there's already an in-flight request for this exact tf and count, wait for it
    if (cached && cached.promise) {
        return cached.promise;
    }

    const promise = (async () => {
        try {
            const account = await metaApi.metatraderAccountApi.getAccount(accountId);
            const candles = await account.getHistoricalCandles(SYMBOL, tf, undefined, count);
            
            const result = candles.map((c: any) => ({
                time: Math.floor(new Date(c.time).getTime() / 1000),
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.tickVolume || c.volume || 0
            }));
            
            candleCache.set(cacheKey, { timestamp: Date.now(), data: result });
            return result;
        } catch (err) {
            candleCache.delete(cacheKey);
            logger.error({ err }, "Failed to fetch historical candles from MetaApi");
            throw err;
        }
    })();

    candleCache.set(cacheKey, { timestamp: now, data: [], promise });
    return promise;
}`;

if (content.includes(targetFunc)) {
  content = content.replace(targetFunc, replacementFunc);
  fs.writeFileSync(file, content);
  console.log("REPLACED SUCCESSFULLY");
} else {
  console.log("NO MATCH");
}
