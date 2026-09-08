import fs from "node:fs";

// Safely load local .env file if available without failing in Cloud Run
try {
  if (typeof process.loadEnvFile === "function") {
    const candidatePaths = [".env", "../../.env", "../.env"];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        process.loadEnvFile(p);
        break;
      }
    }
  }
} catch {}

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

// Port selection:
// 1. Google Cloud Run automatically defines K_SERVICE, K_REVISION, and PORT (default 8080).
//    When running in Cloud Run, we MUST listen on process.env.PORT (8080).
// 2. Google AI Studio preview environment defines CONTROL_PLANE_PORT (8000) and routes traffic to port 3000.
const isCloudRun = !!process.env.K_SERVICE || !!process.env.K_REVISION;
const isAIStudio = !isCloudRun && (!!process.env.CONTROL_PLANE_PORT || (!!process.env.DEFAULT_APP_PORT && !process.env.K_SERVICE));

const port = isAIStudio ? 3000 : parseInt(process.env.PORT || "8080", 10);

logger.info({
  port,
  isCloudRun,
  isAIStudio,
  envPort: process.env.PORT,
  kService: process.env.K_SERVICE
}, "Initializing HTTP server");

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server successfully started and listening");
});

server.on("error", (err: any) => {
  logger.error({ err, port }, "Fatal server listen error");
  process.exit(1);
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
