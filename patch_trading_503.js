const fs = require('fs');
let file = 'artifacts/api-server/src/routes/trading.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'res.status(503).json({ error: "Market data unavailable" });',
  'res.status(503).json({ error: "Market data unavailable", message: "Market data unavailable" });'
);

// We want to avoid pino-http logging 503 as an error. 
// Actually, pino-http logs ANY status code >= 500 as an error.
// We can't easily change pino-http behavior in this app without changing its setup.
// If the frontend is logging "failed with status code 503", the frontend Axios/fetch interceptor might be throwing.
