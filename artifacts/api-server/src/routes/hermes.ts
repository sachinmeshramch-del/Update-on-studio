import { Router } from "express";
import { getHermesStateSummary, runHermesReflection, resetHermesToDefault } from "../lib/hermesEngine.js";
import { getSystemSettings, insertSignal } from "@workspace/db";
import { getLatestPrice } from "../lib/priceEvents.js";
import { executeTradeWithCapitalManagement } from "../lib/autoTrader.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import { logger } from "../lib/logger.js";

export const hermesRouter = Router();

/**
 * GET /api/hermes/status
 * Returns full status of Hermes AI Brain, current strategy version,
 * reflection cadence progress, active parameter weights, and hypothesis history.
 */
hermesRouter.get("/status", async (req, res) => {
  try {
    const summary = await getHermesStateSummary();
    res.json(summary);
  } catch (err: any) {
    logger.error({ err }, "[Hermes Router] Failed to fetch Hermes status");
    res.status(500).json({ error: "Failed to retrieve Hermes state" });
  }
});

/**
 * POST /api/hermes/reflect
 * Manually trigger an immediate Hermes reflection evaluation cycle
 */
hermesRouter.post("/reflect", async (req, res) => {
  try {
    logger.info("[Hermes Router] Manual reflection requested via API");
    const hypothesis = await runHermesReflection(true);
    const summary = await getHermesStateSummary();
    res.json({
      success: true,
      message: hypothesis ? "Reflection cycle completed" : "No closed trades available to evaluate",
      hypothesis,
      summary,
    });
  } catch (err: any) {
    logger.error({ err }, "[Hermes Router] Failed to trigger manual reflection");
    res.status(500).json({ error: err?.message || "Failed to execute reflection" });
  }
});

/**
 * POST /api/hermes/reset
 * Restore Hermes strategy parameters and version back to factory defaults
 */
hermesRouter.post("/reset", async (req, res) => {
  try {
    logger.info("[Hermes Router] Factory reset requested via API");
    const summary = await resetHermesToDefault();
    res.json({
      success: true,
      message: "Hermes parameters restored to baseline factory defaults",
      summary,
    });
  } catch (err: any) {
    logger.error({ err }, "[Hermes Router] Failed to reset Hermes parameters");
    res.status(500).json({ error: err?.message || "Failed to reset Hermes" });
  }
});

/**
 * POST /api/webhooks/tradingview
 * Ingests external TradingView Pine Script JSON alerts directly into the execution engine.
 * Expected payload:
 * {
 *   "action": "BUY" | "SELL" | "LONG" | "SHORT",
 *   "symbol": "XAUUSD" | "GOLD",
 *   "price": 2650.5,
 *   "stopLoss": 2642.0,
 *   "takeProfit": 2665.0,
 *   "passcode": "goldswing2024",
 *   "strategy": "TradingView PineScript Scalper"
 * }
 */
hermesRouter.post("/webhook/tradingview", async (req, res) => {
  try {
    const body = req.body || {};
    const settings = await getSystemSettings();

    // Verify passcode/secret token if provided
    const providedPasscode = body.passcode || req.headers["x-webhook-passcode"] || req.headers["x-telegram-token"];
    if (settings.dashboardPasscode && providedPasscode !== settings.dashboardPasscode) {
      logger.warn({ ip: req.ip }, "[TradingView Webhook] Rejected: Invalid passcode");
      return res.status(401).json({ error: "Unauthorized: Invalid passcode" });
    }

    const rawAction = String(body.action || body.signal || "").toUpperCase();
    const direction: "LONG" | "SHORT" | null =
      rawAction === "BUY" || rawAction === "LONG" ? "LONG" :
      rawAction === "SELL" || rawAction === "SHORT" ? "SHORT" : null;

    if (!direction) {
      return res.status(400).json({ error: "Invalid or missing action. Must be BUY/SELL or LONG/SHORT." });
    }

    const livePriceObj = getLatestPrice();
    const entryPrice = Number(body.price || livePriceObj?.price || 0);
    if (!entryPrice || entryPrice <= 0) {
      return res.status(400).json({ error: "Valid price is required or price feed must be online." });
    }

    const stopLoss = Number(body.stopLoss || body.sl || (direction === "LONG" ? entryPrice - 4 : entryPrice + 4));
    const takeProfit = Number(body.takeProfit || body.tp || (direction === "LONG" ? entryPrice + 6 : entryPrice - 6));
    const strategyName = String(body.strategy || "TradingView Pine Script");

    logger.info(
      { direction, entryPrice, stopLoss, takeProfit, strategyName },
      "🚀 [TradingView Webhook] Received validated external alert"
    );

    // Save signal to database
    await insertSignal({
      signal: direction,
      entryPrice,
      stopLoss,
      takeProfit,
      confidence: 85, // External high-conviction alert
      trend: direction === "LONG" ? "BULLISH" : "BEARISH",
      reason: `[TradingView Webhook] ${strategyName} triggered ${direction} at ${entryPrice}`,
      tradeStatus: "RUNNING",
      isRealTrade: settings.tradingMode === "REAL" && settings.autoTradingRealEnabled,
      signalType: "TREND_FOLLOW",
      tradeDuration: "1-4 hours",
      timeframe: "15m",
      session: {
        active: "TradingView Webhook",
        london: false,
        newYork: false,
        asian: false,
        marketOpen: true,
      },
    });

    sendTelegramNotification(
      `🔔 *TRADINGVIEW PINE SCRIPT ALERT RECEIVED*\n` +
      `*Action:* ${direction}\n` +
      `*Strategy:* ${strategyName}\n` +
      `*Entry:* ${entryPrice}\n` +
      `*SL:* ${stopLoss} | *TP:* ${takeProfit}`
    ).catch(() => {});

    // If auto-trading is active, dispatch to MT5 broker
    const accountId = settings.tradingMode === "REAL" ? settings.realAccountId : settings.demoAccountId;
    const isAutoEnabled = settings.tradingMode === "REAL" ? settings.autoTradingRealEnabled : settings.autoTradingDemoEnabled;

    let executionResult = null;
    if (isAutoEnabled && accountId) {
      try {
        executionResult = await executeTradeWithCapitalManagement(
          accountId,
          settings.tradingMode || "DEMO",
          direction,
          stopLoss,
          takeProfit,
          entryPrice,
          settings
        );
      } catch (execErr: any) {
        logger.error({ err: execErr?.message || execErr }, "[TradingView Webhook] Auto-execution failed");
      }
    }

    res.json({
      success: true,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      executedOnBroker: Boolean(executionResult),
    });
  } catch (err: any) {
    logger.error({ err }, "[TradingView Webhook] Handler error");
    res.status(500).json({ error: err?.message || "Internal server error processing webhook" });
  }
});
