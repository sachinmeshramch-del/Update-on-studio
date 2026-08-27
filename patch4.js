const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    // Fetch sequentially to avoid hitting MetaApi's 5 concurrent historical request limit
    const candles5m = await (dataSource === "metaapi" ? getMetaApiHistoricalOHLC("5m", 300) : fetchOHLC("5m"));
    const candles1m = await (dataSource === "metaapi" ? getMetaApiHistoricalOHLC("1m", 300) : fetchOHLC("1m"));
    const candles15m = await (dataSource === "metaapi" ? getMetaApiHistoricalOHLC("15m", 100) : fetchOHLC("15m"));`;

const replacement = `    // Fetch sequentially and fallback to TwelveData/Finnhub on MetaApi failure
    const fetchWithFallback = async (tf, count) => {
      if (dataSource !== "metaapi") return fetchOHLC(tf);
      try {
        return await getMetaApiHistoricalOHLC(tf, count);
      } catch (err) {
        logger.warn({ err: err.message }, "MetaApi history failed, falling back to fetchOHLC for " + tf);
        return fetchOHLC(tf);
      }
    };
    
    const candles5m = await fetchWithFallback("5m", 300);
    const candles1m = await fetchWithFallback("1m", 300);
    const candles15m = await fetchWithFallback("15m", 100);`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("PATCHED");
