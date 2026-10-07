import { sendPushToAll } from "../lib/pushNotifications.js";
import { Router, type IRouter, type Request, type Response } from "express";
import { generateSignal, initSignalCooldown } from "../lib/signalEngine.js";
import { startTradeTracker } from "../lib/tradeTracker.js";
import { getAnalyticsSummary, setSmartMode } from "../lib/performanceAnalytics.js";
import { resetCooldownTimer } from "../lib/signalEngine.js";
import { priceEmitter, getLatestPrice, setLatestPrice, type LivePrice } from "../lib/priceEvents.js";
import { broadcastToWebSocketClients } from "../lib/priceWebSocket.js";
import { getMetaApiStatus, getActiveAccountId, closeOpenBrokerPositionsForSignal, getLastPriceTime, getMetaApiLatency, getAccountFundsInfo } from "../lib/metaApiFeed.js";
import { getRecentSignals, clearAllHistory, deleteSignalById, insertPushSubscription, deletePushSubscription, updateTradeStatus, getSignalById, getSystemSettings } from "@workspace/db";
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
           const { getMetaApiHistoricalOHLC, getLivePrice } = await import("../lib/metaApiFeed.js");
           const quickLive = await getLivePrice().catch(() => null);
           if (quickLive && typeof quickLive.bid === 'number' && typeof quickLive.ask === 'number') {
               const mid = Number(((quickLive.bid + quickLive.ask) / 2).toFixed(2));
               live = {
                 price: mid,
                 bid: quickLive.bid,
                 ask: quickLive.ask,
                 spread: quickLive.spread || 0.50,
                 change: 0,
                 changePercent: 0,
                 high24h: mid,
                 low24h: mid,
                 timestamp: new Date().toISOString(),
                 direction: "unchanged",
                 ms: Date.now(),
                 source: "metaapi"
               };
           } else {
               const recent = await getMetaApiHistoricalOHLC("1m", 1);
               if (recent && recent.length > 0) {
                   const c = recent[recent.length - 1];
                   live = {
                     price: c.close,
                     bid: Number((c.close - 0.25).toFixed(2)),
                     ask: Number((c.close + 0.25).toFixed(2)),
                     spread: 0.50,
                     change: 0,
                     changePercent: 0,
                     high24h: c.high,
                     low24h: c.low,
                     timestamp: new Date(c.time > 1000000000000 ? c.time : c.time * 1000).toISOString(),
                     direction: "unchanged",
                     ms: Date.now(),
                     source: "metaapi"
                   };
               } else {
                   res.status(503).json({ error: "Market data unavailable" });
                   return;
               }
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
           const { getMetaApiHistoricalOHLC, getLivePrice } = await import("../lib/metaApiFeed.js");
           const quickLive = await getLivePrice().catch(() => null);
           if (quickLive && typeof quickLive.bid === 'number' && typeof quickLive.ask === 'number') {
               const mid = Number(((quickLive.bid + quickLive.ask) / 2).toFixed(2));
               live = {
                 price: mid,
                 bid: quickLive.bid,
                 ask: quickLive.ask,
                 spread: quickLive.spread || 0.50,
                 change: 0,
                 changePercent: 0,
                 high24h: mid,
                 low24h: mid,
                 timestamp: new Date().toISOString(),
                 direction: "unchanged",
                 ms: Date.now(),
                 source: "metaapi"
               };
           } else {
               const recent = await getMetaApiHistoricalOHLC("1m", 1);
               if (recent && recent.length > 0) {
                   const c = recent[recent.length - 1];
                   live = {
                     price: c.close,
                     bid: Number((c.close - 0.25).toFixed(2)),
                     ask: Number((c.close + 0.25).toFixed(2)),
                     spread: 0.50,
                     change: 0,
                     changePercent: 0,
                     high24h: c.high,
                     low24h: c.low,
                     timestamp: new Date(c.time > 1000000000000 ? c.time : c.time * 1000).toISOString(),
                     direction: "unchanged",
                     ms: Date.now(),
                     source: "metaapi"
                   };
               } else {
                   res.status(503).json({ error: "Market data unavailable" });
                   return;
               }
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
router.get("/connections", async (req, res) => {
  let activeId = getActiveAccountId();
  if (!activeId) {
    const settings = await getSystemSettings().catch(() => null);
    activeId = settings?.realAccountId || null;
  }
  let funds: any = null;
  if (activeId) {
    try {
      const fundsInfo = await getAccountFundsInfo(activeId);
      if (fundsInfo) {
        const live = getLatestPrice();
        const price = live?.price || 4110;
        const leverage = fundsInfo.leverage || 1000;
        // 0.01 lot of Gold (100 oz contract size) = 1 oz
        const marginForMinLot = Number(((price * 100 * 0.01) / leverage).toFixed(2));
        const freeMargin = Number(fundsInfo.freeMargin.toFixed(2));
        const equity = Number(fundsInfo.equity.toFixed(2));
        const canTrade = freeMargin >= marginForMinLot;
        funds = {
          equity,
          freeMargin,
          leverage,
          marginForMinLot,
          canTrade,
          warning: !canTrade
            ? `MT5 Free Margin ($${freeMargin}) is lower than required margin ($${marginForMinLot}) for minimum 0.01 lot.`
            : undefined
        };
      }
    } catch {}
  }

  res.json({
    metaapi: getMetaApiStatus(),
    lastHeartbeat: getLastPriceTime(),
    latencyMs: getMetaApiLatency(),
    activeSource: getLatestPrice()?.source || "none",
    activeAccountId: activeId,
    funds
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
        // Fallback to quick live price or historical candle close if live tick hasn't arrived
        try {
           const { getMetaApiHistoricalOHLC, getLivePrice } = await import("../lib/metaApiFeed.js");
           const quickLive = await getLivePrice().catch(() => null);
           if (quickLive && typeof quickLive.bid === 'number' && typeof quickLive.ask === 'number') {
               price = Number(((quickLive.bid + quickLive.ask) / 2).toFixed(2));
           } else {
               const recent = await getMetaApiHistoricalOHLC("1m", 1);
               if (recent && recent.length > 0) {
                   price = recent[recent.length - 1].close;
                   req.log.info({ price }, "Using recent 1m candle close for signal since live price is unavailable");
               } else {
                   res.status(503).json({ error: "Market data unavailable" });
                   return;
               }
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
    const limitParam = parseInt((req.query.limit as string) ?? "1000", 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 1000 : Math.min(limitParam, 5000);

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
    
    // Forcibly reset the bot's signal cooldown to prevent it from instantly jumping back into the market
    try {
        resetCooldownTimer();
    } catch (e) {
        req.log.warn({ e }, "Failed to reset cooldown timer");
    }
    
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