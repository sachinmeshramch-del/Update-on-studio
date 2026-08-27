const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    // Fetch sequentially and fallback to TwelveData/Finnhub on MetaApi failure
    const fetchWithFallback = async (tf, count) => {
      if (dataSource !== "metaapi") return fetchOHLC(tf);
      const { getMetaApiStatus, getLivePrice } = require("./metaApiFeed.js");
      if (getMetaApiStatus() !== "connected") {
        logger.warn("MetaApi is not connected, falling back to fetchOHLC for " + tf);
        return fetchOHLC(tf);
      }`;

const replacement = `    // Fetch sequentially and fallback to TwelveData/Finnhub on MetaApi failure
    const fetchWithFallback = async (tf, count) => {
      if (dataSource !== "metaapi") return fetchOHLC(tf);
      
      const { getMetaApiStatus } = await import("./metaApiFeed.js");
      if (getMetaApiStatus() !== "connected") {
        logger.warn("MetaApi is not connected, falling back to fetchOHLC for " + tf);
        return fetchOHLC(tf);
      }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("PATCHED");
} else {
  console.log("NOT FOUND");
}
