import { sendPushToAll } from "../lib/pushNotifications.js";
import { Router, type IRouter, type Request, type Response } from "express";
import { generateSignal, initSignalCooldown } from "../lib/signalEngine.js";
import { startTradeTracker } from "../lib/tradeTracker.js";
import { getAnalyticsSummary, setSmartMode, resetAnalyticsCache } from "../lib/performanceAnalytics.js";
import { resetCooldownTimer } from "../lib/signalEngine.js";
import { priceEmitter, getLatestPrice, setLatestPrice, type LivePrice } from "../lib/priceEvents.js";
import { broadcastToWebSocketClients } from "../lib/priceWebSocket.js";
import { getMetaApiStatus, getActiveAccountId, closeOpenBrokerPositionsForSignal, getLastPriceTime, getMetaApiLatency, getAccountFundsInfo, getOpenBrokerPositions } from "../lib/metaApiFeed.js";
import { getRecentSignals, clearAllHistory, deleteSignalById, insertPushSubscription, deletePushSubscription, updateTradeStatus, getSignalById, getSystemSettings } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getVapidPublicKey } from "../lib/pushNotifications.js";
import { calculateDynamicAtrStopLoss, type AtrRegimePreset } from "../lib/dynamicAtrStopLoss.js";
import { getMetaApiHistoricalOHLC } from "../lib/metaApiFeed.js";
import { parseAndImportTradeCsv, getSampleCsvTemplate } from "../lib/csvTradeImporter.js";
import { runBacktest, getPastBacktestRuns } from "../lib/backtestEngine.js";
import {
  auditHistoricalData,
  syncHistoricalCandlesFromMetaApi,
  importCandlesFromCsv,
  loadStoredCandles,
} from "../lib/historicalDataManager.js";
import {
  discoverExistingStrategies,
  checkHistoricalDataReadiness,
  getResearchCampaignStatus,
  startResearchCampaign,
  pauseResearchCampaign,
  resumeResearchCampaign,
  cancelResearchCampaign,
  queryAiResearchAssistant,
  generateProposedConfiguration,
  applyCandidateToLiveBot,
} from "../lib/autonomousResearchController.js";

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
               const recent = await getMetaApiHistoricalOHLC("1m", 1).catch(() => []);
               if (recent && recent.length > 0) {
                   price = recent[recent.length - 1].close;
                   req.log.info({ price }, "Using recent 1m candle close for signal since live price is unavailable");
               } else {
                   const { getHistoricalCandlesForEngine } = await import("../lib/historicalDataManager.js");
                   const stored = getHistoricalCandlesForEngine("XAUUSD", "5m", 5);
                   if (stored && stored.length > 0) {
                       price = stored[stored.length - 1].close;
                       req.log.info({ price }, "Using stored 5m candle close for signal");
                   } else {
                       price = 4175.0; // Safe default gold price reference
                   }
               }
           }
        } catch {
           const { getHistoricalCandlesForEngine } = await import("../lib/historicalDataManager.js");
           const stored = getHistoricalCandlesForEngine("XAUUSD", "5m", 5);
           price = stored && stored.length > 0 ? stored[stored.length - 1].close : 4175.0;
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

// ── Deterministic ORB Status endpoint (Hybrid Dual-Engine) ─────────────────
router.get("/orb/status", async (req, res) => {
  try {
    const { getDeterministicOrbStatus } = await import("../lib/deterministicOrbEngine.js");
    const live = getLatestPrice();
    const status = await getDeterministicOrbStatus(live?.price);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: "orb_status_error", message: err?.message || String(err) });
  }
});

// ── Dynamic ATR Stop-Loss Calculator endpoint ──────────────────────────────
router.all("/atr-calculator", async (req: Request, res: Response) => {
  try {
    const params = req.method === "POST" ? req.body : req.query;
    const live = getLatestPrice();
    const livePrice = live?.price ?? 2650.0;
    const liveSpread = live?.spread ?? 0.50;

    let candles: any[] = [];
    try {
      candles = await getMetaApiHistoricalOHLC("5m", 35);
    } catch {}

    let liveAtr = 2.65;
    if (candles && candles.length >= 15) {
      const atrs = calcATR(candles, 14);
      liveAtr = atrs[atrs.length - 1] ?? 2.65;
    }

    const direction = (String(params.direction || "LONG").toUpperCase() === "SHORT" ? "SHORT" : "LONG") as "LONG" | "SHORT";
    const currentPrice = params.entryPrice ? Number(params.entryPrice) : livePrice;
    const atr = params.atr ? Number(params.atr) : liveAtr;
    const spread = params.spread ? Number(params.spread) : liveSpread;
    const preset = (params.preset as AtrRegimePreset) || "STANDARD";
    const customMultiplier = params.multiplier ? Number(params.multiplier) : undefined;
    const accountEquity = params.equity ? Number(params.equity) : 1000;
    const riskPercent = params.riskPercent ? Number(params.riskPercent) : 1.0;
    const contractSize = params.contractSize ? Number(params.contractSize) : 100;

    const result = calculateDynamicAtrStopLoss({
      currentPrice,
      direction,
      atr,
      candlesPrimary: candles,
      liveSpread: spread,
      preset,
      customMultiplier,
      accountEquity,
      riskPercent,
      contractSize,
    });

    res.json({
      success: true,
      liveMarket: {
        price: livePrice,
        spread: liveSpread,
        atr5m: Number(liveAtr.toFixed(2)),
      },
      ...result,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Error calculating dynamic ATR stop loss");
    res.status(500).json({ success: false, error: err.message || "Failed to calculate dynamic stop loss" });
  }
});

// ── History endpoint ───────────────────────────────────────────────────────
router.get(["/history", "/signals"], async (req, res) => {
  try {
    const limitParam = parseInt((req.query.limit as string) ?? "1000", 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 1000 : Math.min(limitParam, 5000);

    const [rows, openBrokerPositions] = await Promise.all([
      getRecentSignals(limit),
      getOpenBrokerPositions().catch(() => [])
    ]);

    const signals = rows.map((r: any) => {
      // Cross-verify with open broker positions in real time
      const matchingOpenPos = openBrokerPositions.find((p: any) => {
        if (r.brokerPositionId && String(r.brokerPositionId) === String(p.id)) return true;
        const rTime = r.createdAt ? new Date(r.createdAt).getTime() : 0;
        const pTime = p.time ? new Date(p.time).getTime() : 0;
        const timeMatch = rTime > 0 && Math.abs(pTime - rTime) <= 180_000;
        const dirMatch = (r.signal === "LONG" && p.type === "POSITION_TYPE_BUY") ||
                         (r.signal === "SHORT" && p.type === "POSITION_TYPE_SELL");
        const priceMatch = Math.abs((p.openPrice ?? 0) - r.entryPrice) <= 2.5;
        return timeMatch && dirMatch && priceMatch;
      });

      // True if explicitly marked as real trade, or has a verified broker ticket, or currently open on broker
      const isExecuted = Boolean(r.isRealTrade === true || r.brokerPositionId || matchingOpenPos);
      const positionId = matchingOpenPos?.id ? String(matchingOpenPos.id) : (r.brokerPositionId ? String(r.brokerPositionId) : null);
      const isRunning = (r.tradeStatus ?? "RUNNING") === "RUNNING";

      let executionStatus: "EXECUTED" | "NOT_EXECUTED" = isExecuted ? "EXECUTED" : "NOT_EXECUTED";
      let executionReason = r.executionReason;
      if (!executionReason) {
        if (isExecuted) {
          executionReason = positionId ? `Executed on Real MT5 Account (Ticket #${positionId})` : "Executed on Real MT5 Account";
        } else if (isRunning) {
          executionReason = "Running as Signal Only (Not executed on MT5 account — Auto-trading disabled or risk shield active)";
        } else {
          executionReason = "Not executed on MT5 (Simulated / Signal Only)";
        }
      }

      return {
        id:               String(r.id),
        signal:           r.signal as "LONG" | "SHORT" | "HOLD",
        confidence:       r.confidence,
        entryPrice:       r.entryPrice,
        stopLoss:         r.stopLoss,
        takeProfit:       r.takeProfit,
        trend:            r.trend as "BULLISH" | "BEARISH" | "NEUTRAL",
        reason:           r.reason,
        timestamp:        r.createdAt.toISOString(),
        tradeDuration:    r.tradeDuration,
        tradeStatus:      (r.tradeStatus ?? "RUNNING") as "RUNNING" | "TARGET_HIT" | "STOP_HIT" | "HOLD",
        closedPrice:      r.closedPrice ?? undefined,
        closedAt:         r.closedAt ? r.closedAt.toISOString() : undefined,
        pnlPoints:        r.pnlPoints ?? undefined,
        signalType:       r.signalType ?? "TREND_FOLLOW",
        isRealTrade:      isExecuted,
        executionStatus,
        executionType:    isExecuted ? "REAL_MT5" : "SIMULATED",
        brokerPositionId: positionId,
        executionReason,
      };
    });

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

// ── CSV Trade Import ───────────────────────────────────────────────────────
router.post("/history/import-csv", async (req: Request, res: Response) => {
  try {
    const csvContent = typeof req.body === "string" ? req.body : req.body?.csv;
    if (!csvContent || typeof csvContent !== "string") {
      res.status(400).json({ success: false, error: "Missing 'csv' string in request body" });
      return;
    }

    const result = await parseAndImportTradeCsv(csvContent);
    // Force refresh analytics summary cache
    await getAnalyticsSummary(true).catch(() => null);

    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Error importing CSV trades");
    res.status(500).json({ success: false, error: err.message || "Failed to process CSV file" });
  }
});

// ── Sample CSV Template Download ───────────────────────────────────────────
router.get("/history/csv-template", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="trade_history_template.csv"');
  res.send(getSampleCsvTemplate());
});

// ── Historical Strategy Backtesting ────────────────────────────────────────
router.post("/backtest/run", async (req: Request, res: Response) => {
  try {
    const result = await runBacktest(req.body || {});
    // NOTE: Per user instruction, backtesting triggered signals are NOT saved to the live history table.
    // They are returned directly to the backtest client and saved in .backtest_runs/ for audit and comparison.
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Error running strategy backtest");
    res.status(500).json({ success: false, error: err.message || "Failed to execute historical backtest" });
  }
});

router.post("/history/sync-backtest", (_req: Request, res: Response) => {
  // Deprecated: Backtest trades are segregated from the live signal history table.
  res.json({ success: true, count: 0, message: "Backtesting signals are isolated and never written to live history." });
});

router.post("/history/purge-simulated", async (_req: Request, res: Response) => {
  try {
    const { clearSimulatedBacktestTrades } = await import("@workspace/db");
    const count = await clearSimulatedBacktestTrades();
    res.json({ success: true, purged: count, message: `Purged ${count} simulated backtest records from history table.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to purge simulated records" });
  }
});

// ── Historical Market Data Endpoints ──────────────────────────────────────
router.get("/history/candles/summary", async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || "XAUUSD";
    const timeframe = (req.query.timeframe as string) || "5m";
    const audit = auditHistoricalData(symbol, timeframe);
    res.json(audit);
  } catch (err: any) {
    req.log.error({ err }, "Error getting historical candles summary");
    res.status(500).json({ error: err.message || "Failed to get summary" });
  }
});

router.post("/history/candles/sync", async (req: Request, res: Response) => {
  try {
    const timeframe = req.body?.timeframe || "5m";
    const count = Number(req.body?.count) || 1000;
    const result = await syncHistoricalCandlesFromMetaApi(timeframe, count);
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Error syncing historical candles from MetaApi");
    res.status(500).json({ success: false, error: err.message || "Failed to sync historical candles" });
  }
});

router.post("/history/candles/import-csv", async (req: Request, res: Response) => {
  try {
    const csvContent = typeof req.body === "string" ? req.body : req.body?.csv;
    const symbol = req.body?.symbol || "XAUUSD";
    const timeframe = req.body?.timeframe || "5m";
    if (!csvContent || typeof csvContent !== "string") {
      res.status(400).json({ success: false, error: "Missing 'csv' string in request body" });
      return;
    }
    const result = importCandlesFromCsv(csvContent, symbol, timeframe);
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Error importing CSV candles");
    res.status(500).json({ success: false, error: err.message || "Failed to process CSV file" });
  }
});

router.get("/backtest/runs", (_req: Request, res: Response) => {
  try {
    const runs = getPastBacktestRuns();
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Autonomous Strategy Research Controller Endpoints ──────────────────────
router.get("/research/status", (_req: Request, res: Response) => {
  try {
    const status = getResearchCampaignStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get campaign status" });
  }
});

router.get("/research/strategies", (_req: Request, res: Response) => {
  try {
    const strategies = discoverExistingStrategies();
    res.json({ success: true, count: strategies.length, strategies });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to discover strategies" });
  }
});

router.get("/research/historical-readiness", (_req: Request, res: Response) => {
  try {
    const readiness = checkHistoricalDataReadiness();
    res.json(readiness);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to verify data readiness" });
  }
});

router.post("/research/campaign/start", async (req: Request, res: Response) => {
  try {
    const options = req.body || {};
    const state = await startResearchCampaign(options);
    res.json({ success: true, state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to start campaign" });
  }
});

router.post("/research/campaign/pause", (_req: Request, res: Response) => {
  try {
    const state = pauseResearchCampaign();
    res.json({ success: true, state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to pause campaign" });
  }
});

router.post("/research/campaign/resume", (_req: Request, res: Response) => {
  try {
    const state = resumeResearchCampaign();
    res.json({ success: true, state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to resume campaign" });
  }
});

router.post("/research/campaign/cancel", (_req: Request, res: Response) => {
  try {
    const state = cancelResearchCampaign();
    res.json({ success: true, state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to cancel campaign" });
  }
});

router.post("/research/ai-assistant", async (req: Request, res: Response) => {
  try {
    const query = req.body?.query || "Which strategy performed best out of sample and why?";
    const response = await queryAiResearchAssistant(query);
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "AI Research Assistant error" });
  }
});

router.post("/research/proposed-config/generate", (req: Request, res: Response) => {
  try {
    const candidateId = req.body?.candidateId;
    if (!candidateId) {
      res.status(400).json({ error: "candidateId is required" });
      return;
    }
    const result = generateProposedConfiguration(candidateId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate proposed config" });
  }
});

router.post("/research/apply-to-live", async (req: Request, res: Response) => {
  try {
    const { candidateId, targetEnvironment } = req.body || {};
    if (!candidateId) {
      res.status(400).json({ success: false, error: "candidateId is required" });
      return;
    }
    const result = await applyCandidateToLiveBot(candidateId, { targetEnvironment });
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to apply strategy to live bot" });
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

router.post("/performance/reset", async (_req, res) => {
  try {
    const { updateSystemSettings } = await import("@workspace/db");
    await updateSystemSettings({ tradingState: "ACTIVE" });
    resetAnalyticsCache();
    resetCooldownTimer();
    const analytics = await getAnalyticsSummary(true);
    res.json({ success: true, message: "Performance Monitor reset. Trading is ACTIVE.", analytics });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to reset performance monitor" });
  }
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