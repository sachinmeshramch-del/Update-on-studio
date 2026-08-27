const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    const [candles5m, candles1m, candles15m, recentStops] = await Promise.all([
      dataSource === "metaapi" ? getMetaApiHistoricalOHLC("5m", 300) : fetchOHLC("5m"),
      dataSource === "metaapi" ? getMetaApiHistoricalOHLC("1m", 300) : fetchOHLC("1m"),
      dataSource === "metaapi" ? getMetaApiHistoricalOHLC("15m", 100) : fetchOHLC("15m"),
      getRecentStopCounts(),
    ]);`;

const replacement = `    // Fetch sequentially to avoid hitting MetaApi's 5 concurrent historical request limit
    const candles5m = await (dataSource === "metaapi" ? getMetaApiHistoricalOHLC("5m", 300) : fetchOHLC("5m"));
    const candles1m = await (dataSource === "metaapi" ? getMetaApiHistoricalOHLC("1m", 300) : fetchOHLC("1m"));
    const candles15m = await (dataSource === "metaapi" ? getMetaApiHistoricalOHLC("15m", 100) : fetchOHLC("15m"));
    const recentStops = await getRecentStopCounts();`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("REPLACED SUCCESSFULLY");
} else {
  console.log("NO MATCH");
}
