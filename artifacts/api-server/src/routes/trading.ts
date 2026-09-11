import { sendPushToAll } from "../lib/pushNotifications.js";
import { Router, type IRouter, type Request, type Response } from "express";
import { generateSignal, initSignalCooldown, recordTradeClose } from "../lib/signalEngine.js";
import { startTradeTracker } from "../lib/tradeTracker.js";
import { getAnalyticsSummary, setSmartMode } from "../lib/performanceAnalytics.js";
import { priceEmitter, getLatestPrice, setLatestPrice, type LivePrice } from "../lib/priceEvents.js";
import { broadcastToWebSocketClients } from "../lib/priceWebSocket.js";
import { getMetaApiStatus, getActiveAccountId, closeOpenBrokerPositionsForSignal } from "../lib/metaApiFeed.js";
import { getRecentSignals, clearAllHistory, deleteSignalById, insertPushSubscription, deletePushSubscription, updateTradeStatus, getSignalById } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getVapidPublicKey } from "../lib/pushNotifications.js";

// Start background trade outcome tracker

// Restore 15-min inter-signal cooldown from DB so restarts don't reset it
initSignalCooldown().catch((err) => logger.warn({ err }, "Signal cooldown init failed"));

const router: IRouter = Router();

// ── SSE streaming ─────────────────────────────────────────────────────────
const sseClients = new Set<Response>();

priceEmitter.on("price", (data: LivePrice) => {
  broadcastToWebSocketClients(data);

  if (sseClients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
});

router.get("/price/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");

  sseClients.add(res);
  logger.info({ total: sseClients.size }, "SSE client connected");

  const current = getLatestPrice();
  if (current) {
    res.write(`data: ${JSON.stringify(current)}\n\n`);
  }

  req.on("close", () => {
    sseClients.delete(res);
    logger.info({ total: sseClients.size }, "SSE client disconnected");
  });
});

// ── REST price endpoint ────────────────────────────────────────────────────
router.get("/gold-price", async (req, res) => {
  try {
    let live = getLatestPrice();
    
    if (!live) {
      try {
           const { getMetaApiHistoricalOHLC } = await import("../lib/metaApiFeed.js");
           const recent = await getMetaApiHistoricalOHLC("1m", 1);
           if (recent && recent.length > 0) {
               const c = recent[recent.length - 1];
               live = {
                 price: c.close,
                 bid: c.close,
                 ask: c.close,
                 spread: (c as any).spread || 20,
                 change: 0,
                 changePercent: 0,
                 high24h: c.high,
                 low24h: c.low,
                 timestamp: new Date(c.time).toISOString(),
                 direction: "unchanged",
                 ms: Date.now(),
                 source: "metaapi"
               };
           } else {
               res.status(503).json({ error: "Market data unavailable" });
               return;
           }
      } catch (e) {
          res.status(503).json({ error: "Market data unavailable" });
          return;
      }
    }
    res.json(live);
  } catch (err: any) {
    req.log.error({ err }, "Error fetching price");
    res.status(500).json({ error: "price_fetch_error", message: "Failed to fetch gold price" });
  }
});

router.get("/price", async (req, res) => {
  try {
    let live = getLatestPrice();
    
    if (!live) {
      try {
           const { getMetaApiHistoricalOHLC } = await import("../lib/metaApiFeed.js");
           const recent = await getMetaApiHistoricalOHLC("1m", 1);
           if (recent && recent.length > 0) {
               const c = recent[recent.length - 1];
               live = {
                 price: c.close,
                 bid: c.close,
                 ask: c.close,
                 spread: (c as any).spread || 20,
                 change: 0,
                 changePercent: 0,
                 high24h: c.high,
                 low24h: c.low,
                 timestamp: new Date(c.time).toISOString(),
                 direction: "unchanged",
                 ms: Date.now(),
                 source: "metaapi"
               };
           } else {
               res.status(503).json({ error: "Market data unavailable" });
               return;
           }
      } catch (e) {
          res.status(503).json({ error: "Market data unavailable" });
          return;
      }
    }
    res.json(live);
  } catch (err: any) {
    req.log.error({ err }, "Error fetching price");
    res.status(500).json({ error: "price_fetch_error", message: "Failed to fetch gold price" });
  }
});

// ── Connections status endpoint ──────────────────────────────────────────
router.get("/debug", (req, res) => {
    import("../lib/metaApiFeed.js").then(m => {
        res.json({
            blacklist: Array.from(m.invalidAccountBlacklist)
        });
    });
});
router.get("/connections", (req, res) => {
  res.json({
    metaapi: getMetaApiStatus(),
    activeSource: getLatestPrice()?.source || "none",
    activeAccountId: getActiveAccountId()
  });
});

// ── Signal endpoint ────────────────────────────────────────────────────────
router.get("/signal", async (req, res) => {
  try {
    let live = getLatestPrice();
    
    
    let price: number;
    if (live) {
        price = live.price;
    } else {
        // Fallback to historical candle close if live tick hasn't arrived
        try {
           const { getMetaApiHistoricalOHLC } = await import("../lib/metaApiFeed.js");
           const recent = await getMetaApiHistoricalOHLC("1m", 1);
           if (recent && recent.length > 0) {
               price = recent[recent.length - 1].close;
               req.log.info({ price }, "Using recent 1m candle close for signal since live price is unavailable");
           } else {
               res.status(503).json({ error: "Market data unavailable" });
               return;
           }
        } catch (histErr) {
           res.status(503).json({ error: "Market data unavailable" });
           return;
        }
    }
    const signal = await generateSignal(price);

    // NOTE: DB persistence is the scheduler's job only (signalScheduler.ts).
    // The HTTP route is read-only — never insert here or every frontend poll
    // creates a duplicate row for the same cached signal.
    res.json(signal);
  } catch (err: any) {
    if (err.message && (err.message.includes('MetaApi is not connected') || err.message.includes('status code 500'))) {
        res.status(503).json({ error: "signal_error", message: "MetaApi unavailable. Signals paused." });
    } else {
        req.log.warn({ err: err.message }, "Error generating signal");
        res.status(500).json({ error: "signal_error", message: "Failed to generate trading signal" });
    }
  }
});

// ── History endpoint ───────────────────────────────────────────────────────
router.get(["/history", "/signals"], async (req, res) => {
  try {
    const limitParam = parseInt((req.query.limit as string) ?? "200", 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 200 : Math.min(limitParam, 500);

    const rows = await getRecentSignals(limit);

    const signals = rows.map((r: any) => ({
      id:            String(r.id),
      signal:        r.signal as "LONG" | "SHORT" | "HOLD",
      confidence:    r.confidence,
      entryPrice:    r.entryPrice,
      stopLoss:      r.stopLoss,
      takeProfit:    r.takeProfit,
      trend:         r.trend as "BULLISH" | "BEARISH" | "NEUTRAL",
      reason:        r.reason,
      timestamp:     r.createdAt.toISOString(),
      tradeDuration: r.tradeDuration,
      tradeStatus:   (r.tradeStatus ?? "RUNNING") as "RUNNING" | "TARGET_HIT" | "STOP_HIT" | "HOLD",
      closedPrice:   r.closedPrice ?? undefined,
      closedAt:      r.closedAt ? r.closedAt.toISOString() : undefined,
      pnlPoints:     r.pnlPoints ?? undefined,
      signalType:    r.signalType ?? "TREND_FOLLOW",
    }));

    res.json({ signals });
  } catch (err: any) {
    req.log.error({ err }, "Error fetching history");
    res.json({ signals: [] });
  }
});

// ── Clear all history ──────────────────────────────────────────────────────
router.delete("/history/clear", async (req, res) => {
  try {
    const deletedCount = await clearAllHistory();
    res.json({ deleted: deletedCount });
  } catch (err: any) {
    req.log.error({ err }, "Error clearing history");
    res.status(500).json({ error: "clear_error", message: "Failed to clear history" });
  }
});

// ── Delete signal ──────────────────────────────────────────────────────────
router.delete("/history/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const deleted = await deleteSignalById(id as string);
    if (!deleted) {
      res.status(404).json({ error: "not_found", message: "Signal not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Error deleting signal");
    res.status(500).json({ error: "delete_error", message: "Failed to delete signal" });
  }
});


router.post("/signals/:id/close", async (req, res) => {
  const id = req.params.id;
  try {
    const signal = await getSignalById(id);
    if (!signal) {
      res.status(404).json({ error: "not_found", message: "Signal not found" });
      return;
    }
    
    const p = getLatestPrice();
    const currentPrice = p?.price || signal.entryPrice;
    
    const isLong = signal.signal === "LONG";
    const pnl = isLong ? currentPrice - signal.entryPrice : signal.entryPrice - currentPrice;
    
    // Close corresponding open position on MT5 broker if any
    try {
      await closeOpenBrokerPositionsForSignal(signal.signal as "LONG" | "SHORT");
    } catch (brokerErr) {
      req.log.warn({ err: brokerErr }, "Failed to close open broker position on manual close");
    }

    await updateTradeStatus(id, "MANUALLY_CLOSED", currentPrice, Number(pnl.toFixed(2)));
    recordTradeClose(pnl >= 0 ? "WIN" : "LOSS");
    
    res.json({ success: true, closedPrice: currentPrice, pnl: Number(pnl.toFixed(2)) });
  } catch (err: any) {
    req.log.error({ err }, "Error closing signal manually");
    res.status(500).json({ error: "close_error", message: "Failed to close signal: " + (err.message || String(err)) });
  }
});

// ── Analytics endpoints ────────────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  try {
    const analytics = await getAnalyticsSummary();
    res.json(analytics);
  } catch (err: any) {
    req.log.error({ err }, "Error fetching analytics");
    res.status(500).json({ error: "analytics_error", message: "Failed to fetch analytics" });
  }
});

router.post("/analytics/smart-mode", async (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "validation_error", message: "enabled must be a boolean" });
    return;
  }
  setSmartMode(enabled);
  const analytics = await getAnalyticsSummary(true);
  res.json(analytics);
});

// ── Push notification endpoints ────────────────────────────────────────────
router.get("/push/vapid-public-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "vapid_not_configured", message: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey: key });
});

router.post("/push/subscribe", async (req, res) => {
  const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "invalid_subscription", message: "endpoint, keys.p256dh and keys.auth are required" });
    return;
  }
  try {
    await insertPushSubscription(endpoint, keys.p256dh, keys.auth);
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to save push subscription");
    res.status(500).json({ error: "db_error", message: "Failed to save subscription" });
  }
});

router.post("/push/unsubscribe", async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ error: "invalid_request", message: "endpoint is required" });
    return;
  }
  try {
    await deletePushSubscription(endpoint);
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to delete push subscription");
    res.status(500).json({ error: "db_error", message: "Failed to remove subscription" });
  }
});


router.get("/push/test", async (req, res) => {
  try {
    await sendPushToAll({
      title: "Test Notification",
      body: "This is a test to verify push notifications are working.",
      signal: "LONG",
      entryPrice: 2000,
    });
    res.json({ success: true, message: "Pushed to all" });
  } catch (err: any) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;

