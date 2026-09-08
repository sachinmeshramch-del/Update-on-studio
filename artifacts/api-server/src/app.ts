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

const candidatePublicPaths = [
  path.join(__dirname, "../../gold-swing-ai/dist/public"),
  path.join(__dirname, "../../../artifacts/gold-swing-ai/dist/public"),
  path.resolve(process.cwd(), "artifacts/gold-swing-ai/dist/public"),
  path.resolve(process.cwd(), "gold-swing-ai/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
];
const publicPath = candidatePublicPaths.find(p => fs.existsSync(p)) || candidatePublicPaths[0];

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);



// Health check endpoints for Google Cloud Run / load balancers
app.get("/health", (_req, res) => res.status(200).send("OK"));
app.get("/healthz", (_req, res) => res.status(200).send("OK"));

app.use(express.static(publicPath));

app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/assets/')) {
    res.status(404).send('Asset not found');
    return;
  }
  const filePath = path.join(publicPath, "index.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(200).send("<html><head><meta http-equiv='refresh' content='2'></head><body><p>Frontend is building, please wait a few seconds...</p></body></html>");
  }
});



export default app;
