import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import pino from "pino";
import router from "./routes/index.js";
import { logger } from "./lib/logger";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getPublicPath(): string {
  const candidatePublicPaths = [
    path.join(__dirname, "public"),
    path.join(__dirname, "../public"),
    path.join(__dirname, "../../gold-swing-ai/dist/public"),
    path.join(__dirname, "../../../artifacts/gold-swing-ai/dist/public"),
    path.resolve(process.cwd(), "artifacts/api-server/dist/public"),
    path.resolve(process.cwd(), "artifacts/gold-swing-ai/dist/public"),
    path.resolve(process.cwd(), "../gold-swing-ai/dist/public"),
    path.resolve(process.cwd(), "gold-swing-ai/dist/public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "public"),
  ];

  // Look for directory containing index.html first
  for (const p of candidatePublicPaths) {
    if (fs.existsSync(path.join(p, "index.html"))) {
      return p;
    }
  }

  for (const p of candidatePublicPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return candidatePublicPaths[0];
}

const app: Express = express();

app.use(
  pinoHttp({
    customLogLevel: function (req, res, err) {
      if (res.statusCode >= 500) {
        return 'warn';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
    customSuccessMessage: function (req, res) {
      if (res.statusCode === 503) {
        return 'Market data unavailable (503)';
      }
      return 'request completed';
    },
    customErrorMessage: function (req, res, err) {
      if (res.statusCode === 503) {
        return 'Market data unavailable (503)';
      }
      return 'request errored';
    },
    logger,
    serializers: {
      err: (err) => {
        if (err && err.message && err.message.startsWith('failed with status code')) {
          return undefined;
        }
        return pino.stdSerializers.err(err);
      },
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api", router);

// Catch unhandled API requests to prevent falling through to static SPA HTML index.html
app.use("/api", (_req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint ${_req.method} ${_req.originalUrl} not found.`
  });
});

// Global API Error Handler — ensures ALL Express errors (e.g., body parsing, 413, 500) ALWAYS return clean JSON and NEVER HTML
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || err.statusCode || 500;
  logger.error({ err: err.message || err, url: req.originalUrl, status }, "Global Express Error Handler caught exception");
  if (res.headersSent) return;
  res.status(status).json({
    success: false,
    error: err.message || "An internal server error occurred while processing the request."
  });
});



// Health check endpoints for Google Cloud Run / load balancers
app.get("/health", (_req, res) => res.status(200).send("OK"));
app.get("/healthz", (_req, res) => res.status(200).send("OK"));

// Static assets serving with proper caching policies
app.use((req, res, next) => {
  const publicDir = getPublicPath();

  // NEVER cache HTML documents or service worker - ensures browsers instantly receive new bundle hashes after an update
  if (req.path === "/" || req.path === "/index.html" || req.path === "/sw.js") {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  } else if (req.path.startsWith("/assets/")) {
    // Immutable cache for Vite fingerprint-hashed static chunks
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }

  express.static(publicDir, {
    index: false,
    etag: true,
    lastModified: true,
  })(req, res, next);
});

// Single Page Application (SPA) catch-all route
app.get(/.*/, (req, res) => {
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff2?|map)$/i)) {
    res.status(404).send('Asset not found');
    return;
  }
  const publicDir = getPublicPath();
  const filePath = path.join(publicDir, "index.html");
  if (fs.existsSync(filePath)) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(filePath);
  } else {
    logger.warn({ publicDir, cwd: process.cwd(), __dirname }, "index.html not found in candidate paths");
    res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="2">
  <title>Gold Swing AI Pro</title>
</head>
<body style="background:#09090b;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;">
    <div style="display:inline-block;width:36px;height:36px;border:3px solid rgba(234,179,8,0.2);border-top-color:#eab308;border-radius:50%;animation:spin 1s linear infinite;"></div>
    <p style="margin-top:16px;font-size:15px;color:#a1a1aa;">Compiling application bundle... refreshing in 2s</p>
  </div>
  <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
</body>
</html>`);
  }
});



export default app;
