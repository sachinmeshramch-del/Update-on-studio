import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocketServer } from "./lib/priceWebSocket.js";
import { startMetaApiFeed } from "./lib/metaApiFeed.js";
import { initWebPush } from "./lib/pushNotifications.js";
import { startSignalScheduler } from "./lib/signalScheduler.js";
import { startTradeTracker } from "./lib/tradeTracker.js";

const port = 3000;

const server = app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// Attach WebSocket server for frontend real-time price feed
setupWebSocketServer(server);

// Start data stream based on configuration
// Only use MetaApi
startMetaApiFeed().catch(err => {
  logger.error({ err }, "Failed to start MetaApi feed - will retry later or wait for settings");
});

// Web Push + background signal scheduler
initWebPush();
startSignalScheduler();
startTradeTracker();
