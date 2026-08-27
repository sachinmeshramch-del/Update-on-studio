import { getMetaApiStatus } from "./metaApiFeed.js";
import { setLatestPrice, buildLivePrice } from "./priceEvents.js";
import { fetchGoldPrice } from "./goldPrice.js";
import { logger } from "./logger.js";
import { getLastTwelveDataTickMs } from "./twelveDataStream.js";

const TD_STALE_MS = 3_000;
const SPREAD = 0.35;

let fallbackTimer: ReturnType<typeof setInterval> | null = null;

// Return disconnected to keep the /connections endpoint happy
export function getFinnhubStatus() {
    return "disconnected";
}

function startFallbackPolling() {
  if (fallbackTimer) return;
  logger.info("Starting goldprice.org gap-filler polling (2s)");

  fallbackTimer = setInterval(async () => {
    // Skip if MetaApi is active
    const dataSource = process.env.DATA_SOURCE || "twelvedata";
    if (dataSource === "metaapi" && getMetaApiStatus() === "connected") return;
    
    // Skip if TwelveData is active (primary)
    if (Date.now() - getLastTwelveDataTickMs() <= TD_STALE_MS) return;

    try {
      const raw = await fetchGoldPrice();
      const live = buildLivePrice(raw, SPREAD, "goldprice");
      setLatestPrice(live);
    } catch {
      // ignore
    }
  }, 2000);
}

export function startPolygonStream() {
  startFallbackPolling();
}
