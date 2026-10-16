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
import { startDiagnosticMonitor } from "./lib/tradeMonitor.js";
import { startHermesHeartbeatDaemon } from "./lib/hermesLogger.js";

// Port selection:
// 1. Google AI Studio preview environment defines CONTROL_PLANE_PORT (8000) or DEFAULT_APP_PORT (3000).
//    The dev server MUST listen strictly on port 3000 (nginx forwards external traffic to 3000).
// 2. Standalone Google Cloud Run container deployments set PORT (default 8080) without CONTROL_PLANE_PORT.
const isAIStudio = !!process.env.CONTROL_PLANE_PORT || !!process.env.DEFAULT_APP_PORT;
const port = isAIStudio ? 3000 : parseInt(process.env.PORT || "8080", 10);

logger.info({
  port,
  isAIStudio,
  envPort: process.env.PORT,
  kService: process.env.K_SERVICE
}, "Initializing HTTP server");

let hasInitializedServices = false;

function initBackgroundServices(serverInstance: any) {
  if (hasInitializedServices) return;
  hasInitializedServices = true;

  // Attach WebSocket server for frontend real-time price feed
  setupWebSocketServer(serverInstance);

  // Start data stream based on configuration
  // Only use MetaApi
  startMetaApiFeed().catch(err => {
    logger.error({ err }, "Failed to start MetaApi feed - will retry later or wait for settings");
  });

  // Web Push + background signal scheduler
  initWebPush();
  startSignalScheduler();
  startTradeTracker();

  // Start backend diagnostic monitor
  startDiagnosticMonitor();

  // Start Hermes AI Brain heartbeat & communication gap monitor daemon
  startHermesHeartbeatDaemon();
}

function startServer(retries = 12, delayMs = 1500) {
  const server = app.listen(port, "0.0.0.0", () => {
    logger.info({ port, host: "0.0.0.0" }, "Server successfully started and listening");
    initBackgroundServices(server);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE" && retries > 0) {
      logger.warn({ port, retriesLeft: retries }, "Port 3000 is temporarily in use (EADDRINUSE), retrying server listen in 1.5s...");
      setTimeout(() => {
        startServer(retries - 1, delayMs);
      }, delayMs);
    } else {
      logger.error({ err, port }, "Fatal server listen error");
      process.exit(1);
    }
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Received shutdown signal, closing server...");
    server.close(() => {
      logger.info("Server closed successfully.");
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(0);
    }, 2000).unref();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  return server;
}

startServer();
