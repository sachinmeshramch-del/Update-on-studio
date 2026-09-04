const fs = require('fs');
fs.writeFileSync('./artifacts/api-server/src/lib/polygonStream.ts', `import { logger } from "./logger.js";

// Return disconnected to keep the /connections endpoint happy
export function getFinnhubStatus() {
    return "disconnected";
}

function startFallbackPolling() {
  logger.info("Fallback polling completely disabled as requested.");
}

export function startPolygonStream() {
  startFallbackPolling();
}
`);
