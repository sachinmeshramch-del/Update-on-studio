const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', 'utf8');
code = code.replace(
  /if \(metaApiStatus === "connected" && secondsSinceLastTick > 45 && !isConnecting\) \{/,
  "if (metaApiStatus === \"connected\" && secondsSinceLastTick > 300 && !isConnecting) {"
);
code = code.replace(
  /If stalled for >45s or disconnected for >15s/,
  "If stalled for >300s or disconnected for >15s"
);
fs.writeFileSync('./artifacts/api-server/src/lib/metaApiFeed.ts', code);
