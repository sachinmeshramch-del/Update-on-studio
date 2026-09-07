const originalConsoleError = console.error;
console.error = (...args) => {
  if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('MetaApi websocket client closed')) {
    // Suppress noisy MetaApi websocket reconnection errors
    return;
  }
  originalConsoleError(...args);
};

import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocketServer } from "./lib/priceWebSocket.js";
import { startMetaApiFeed } from "./lib/metaApiFeed.js";
import { initWebPush } from "./lib/pushNotifications.js";
import { startSignalScheduler } from "./lib/signalScheduler.js";
import { startTradeTracker } from "./lib/tradeTracker.js";

const port = parseInt(process.env.PORT || "3000", 10);

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
