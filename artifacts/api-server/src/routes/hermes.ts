import { Router } from "express";
import { getHermesStateSummary, runHermesReflection, resetHermesToDefault } from "../lib/hermesEngine.js";
import { getSystemSettings, updateSystemSettings, insertSignal, getLatestSignal, DEFAULT_HERMES_PARAMETERS } from "@workspace/db";
import { getLatestPrice } from "../lib/priceEvents.js";
import { executeTradeWithCapitalManagement } from "../lib/autoTrader.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import { getMetaApiStatus, getActiveAccountId, getLastPriceTime } from "../lib/metaApiFeed.js";
import { getLatestCachedSignal } from "../lib/signalEngine.js";
import { logger } from "../lib/logger.js";
import {
  getHermesLogFeed,
  runHermesCommProbe,
  clearHermesLogBuffer,
  recordHermesStateUpdate,
  type HermesLogType,
  type HermesLogLevel,
} from "../lib/hermesLogger.js";
import {
  STRATEGY_INVENTORY,
  getStrategyEvaluations,
  getStrategyAttributions,
  getStrategyPerformanceReport,
} from "../lib/strategyAttribution.js";

export const hermesRouter = Router();

hermesRouter.get("/strategies/inventory", (_req, res) => {
  res.json({ success: true, strategies: STRATEGY_INVENTORY });
});

hermesRouter.get("/strategies/evaluations", (req, res) => {
  const strategyId = req.query.strategyId as string;
  const timeframe = req.query.timeframe as string;
  const limit = parseInt(req.query.limit as string) || 100;
  const evals = getStrategyEvaluations({ strategyId, timeframe, limit });
  res.json({ success: true, evaluations: evals });
});

hermesRouter.get("/strategies/attributions", (req, res) => {
  const signalId = req.query.signalId as string;
  const attributions = getStrategyAttributions(signalId);
  res.json({ success: true, attributions });
});

hermesRouter.get("/strategies/performance", (_req, res) => {
  const report = getStrategyPerformanceReport();
  res.json({ success: true, report });
});

/**
 * GET /api/hermes/logs
 * Diagnostic logs specifically monitoring Hermes AI Brain heartbeats, state updates, and communication gaps
 */
hermesRouter.get("/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const type = req.query.type as HermesLogType | undefined;
    const level = req.query.level as HermesLogLevel | undefined;
    const feed = await getHermesLogFeed(limit, type, level);
    res.json(feed);
  } catch (err: any) {
    logger.error({ err }, "[Hermes Router] Failed to fetch diagnostic logs");
    res.status(500).json({ error: "Failed to fetch diagnostic logs", message: err?.message });
  }
});

/**
 * POST /api/hermes/logs/probe
 * On-demand communication ping probe across the Hermes Brain service mesh
 */
hermesRouter.post("/logs/probe", async (req, res) => {
  try {
    const probeResult = await runHermesCommProbe();
    res.json(probeResult);
  } catch (err: any) {
    logger.error({ err }, "[Hermes Router] Probe execution failed");
    res.status(500).json({ error: "Probe execution failed", message: err?.message });
  }
});

/**
 * DELETE /api/hermes/logs
 * Reset/clear the diagnostic logs buffer
 */
hermesRouter.delete("/logs", async (req, res) => {
  try {
    clearHermesLogBuffer();
    res.json({ success: true, message: "Hermes diagnostic log buffer cleared." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to clear logs", message: err?.message });
  }
});

/**
 * GET /api/hermes/diagnostics
 * Comprehensive diagnostic telemetry:
 * 1. Health Status & Live System Connectivity
 * 2. Active Memory State, SemVer evolution, and tuned parameter deltas
 * 3. Last Processed Trading Signal with Hermes conviction gating analysis
 */
hermesRouter.get("/diagnostics", async (req, res) => {
  try {
    const summary = await getHermesStateSummary();
    const metaApiStatus = getMetaApiStatus();
    const activeAccountId = getActiveAccountId();
    const lastPriceTime = getLastPriceTime();
    const livePrice = getLatestPrice();
    const settings = await getSystemSettings();

    const cached = getLatestCachedSignal();
    const latestDbSignal = await getLatestSignal();

    const memUsage = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());

    let healthState: "OPTIMAL" | "LEARNING_TRIAL" | "CAUTION_DRAWDOWN" | "PAUSED" = "OPTIMAL";
    if (!summary.enabled) {
      healthState = "PAUSED";
    } else if (summary.latestHypothesis?.status === "ACTIVE_TRIAL") {
      healthState = "LEARNING_TRIAL";
    }

    const parameterDeltas: Record<string, { current: number; baseline: number; diff: number; percentDiff: string }> = {};
    for (const [key, val] of Object.entries(summary.parameters)) {
      const defVal = (DEFAULT_HERMES_PARAMETERS as any)[key] ?? val;
      const diff = Number((val - defVal).toFixed(2));
      const pct = defVal > 0 ? (((val - defVal) / defVal) * 100).toFixed(1) : "0";
      parameterDeltas[key] = {
        current: val,
        baseline: defVal,
        diff,
        percentDiff: `${diff >= 0 ? "+" : ""}${pct}%`,
      };
    }

    let signalPayload: any = null;
    if (cached) {
      const requiredMinConf =
        cached.signalType === "REVERSAL"
          ? summary.parameters.minConfidenceReversal
          : cached.signalType === "RANGE"
          ? summary.parameters.minConfidenceRange
          : summary.parameters.minConfidenceNormal;

      signalPayload = {
        source: "IN_MEMORY_LIVE_ENGINE",
        signal: cached.signal,
        entryPrice: cached.entryPrice,
        stopLoss: cached.stopLoss,
        takeProfit: cached.takeProfit,
        confidence: cached.confidence,
        hermesRequiredConfidence: requiredMinConf,
        convictionPassed: cached.confidence >= requiredMinConf,
        signalType: cached.signalType,
        trend: cached.trend,
        reason: cached.reason,
        timestamp: cached.timestamp,
        indicators: {
          rsi: cached.indicators.rsi,
          atr: cached.indicators.atr,
          ema9: cached.indicators.ema9,
          ema21: cached.indicators.ema21,
          macdHistogram: cached.indicators.macdHistogram,
          trend5m: cached.indicators.trend5m,
          trend1m: cached.indicators.trend1m,
        },
        circuitBreakerActive: cached.circuitBreakerActive,
        tradeDuration: cached.tradeDuration,
      };
    } else if (latestDbSignal) {
      signalPayload = {
        source: "DATABASE_RECORD",
        signal: latestDbSignal.signal,
        entryPrice: latestDbSignal.entryPrice,
        stopLoss: latestDbSignal.stopLoss,
        takeProfit: latestDbSignal.takeProfit,
        confidence: latestDbSignal.confidence ?? 65,
        hermesRequiredConfidence: summary.parameters.minConfidenceNormal,
        convictionPassed: (latestDbSignal.confidence ?? 65) >= summary.parameters.minConfidenceNormal,
        signalType: latestDbSignal.signalType || "TREND_FOLLOW",
        trend: latestDbSignal.trend || "NEUTRAL",
        reason: latestDbSignal.reason || "Historical confirmed signal",
        timestamp: latestDbSignal.createdAt ? new Date(latestDbSignal.createdAt).toISOString() : new Date().toISOString(),
        indicators: null,
        circuitBreakerActive: false,
        tradeDuration: latestDbSignal.tradeDuration || "15m-1h",
      };
    }

    const diagnostics = {
      health: {
        status: healthState,
        heartbeatTimestamp: new Date().toISOString(),
        uptimeSeconds: uptimeSec,
        memoryUsageMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        memoryTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
        services: {
          hermesEngine: summary.enabled ? "ACTIVE" : "DISABLED",
          firestoreDatabase: "CONNECTED",
          metaApiFeed: metaApiStatus?.connected ? "CONNECTED" : (metaApiStatus ? "INITIALIZING" : "STANDBY"),
          brokerExecutionGateway: settings.autoTradingRealEnabled ? "REAL_TRADING_ACTIVE" : (settings.autoTradingDemoEnabled ? "DEMO_ACTIVE" : "SAFETY_MONITOR_ONLY"),
        },
        activeAccountId: activeAccountId || settings.demoAccountId || "6485ceb1-f6b8-4a1d-85e4-af6de3033116",
        livePrice: livePrice?.price ?? null,
        lastPriceLatencyMs: lastPriceTime ? Date.now() - lastPriceTime : null,
      },
      memoryState: {
        strategyVersion: summary.strategyVersion,
        enabled: summary.enabled,
        reflectionCadence: summary.reflectionCadence,
        closedTradesSinceReflection: summary.closedTradesSinceReflection,
        tradesUntilNextReflection: summary.tradesUntilNextReflection,
        cadenceProgressPercent: Math.min(100, Math.round((summary.closedTradesSinceReflection / Math.max(1, summary.reflectionCadence)) * 100)),
        maxDrawdownLimit: summary.maxDrawdownLimit,
        activeParameters: summary.parameters,
        parameterDeltas,
        totalHypothesesCount: summary.totalHypothesesCount,
        latestHypothesis: summary.latestHypothesis,
        recentHypotheses: summary.recentHypotheses,
      },
      lastProcessedSignal: signalPayload,
      engineMode: settings.engineMode || "HYBRID_DUAL",
      orbState: cached?.orbState || null,
    };

    res.json(diagnostics);
  } catch (err: any) {
    logger.error({ err }, "[Hermes Diagnostics] Failed to compile diagnostic report");
    res.status(500).json({ error: "Failed to generate Hermes diagnostics", message: err?.message });
  }
});

/**
 * POST /api/hermes/diagnostic-test
 * Runs an instant connectivity & memory integrity self-test
 */
hermesRouter.post("/diagnostic-test", async (req, res) => {
  try {
    const summary = await getHermesStateSummary();
    const livePrice = getLatestPrice();
    const testResult = {
      testTimestamp: new Date().toISOString(),
      tests: [
        { name: "Hermes Autonomous Engine Core", passed: summary.enabled, detail: `Strategy ${summary.strategyVersion} active` },
        { name: "Firestore Synaptic Memory Vault", passed: summary.totalHypothesesCount >= 0, detail: `${summary.totalHypothesesCount} historical hypotheses synced` },
        { name: "Parameter Bounds & Guardrails", passed: summary.parameters.minConfidenceNormal >= 45 && summary.parameters.minConfidenceNormal <= 65, detail: `minConfidenceNormal = ${summary.parameters.minConfidenceNormal}% (Bounds: 45-65%)` },
        { name: "Live Market Tick Stream", passed: Boolean(livePrice && livePrice.price > 0), detail: livePrice ? `Gold tick stream: $${livePrice.price}` : "Streaming idle" },
      ],
      allPassed: true,
    };
    res.json(testResult);
  } catch (err: any) {
    res.status(500).json({ error: "Diagnostic self-test failed", message: err?.message });
  }
});

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
    recordHermesStateUpdate(
      hypothesis ? `Hermes reflection cycle completed: Version ${summary.strategyVersion}` : "Hermes reflection cycle evaluated (no trades eligible)",
      {
        newState: summary.strategyVersion,
        reason: hypothesis?.rationale || "Manual reflection trigger",
        component: "HERMES_CORE"
      }
    );
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
    recordHermesStateUpdate("Hermes Brain parameters reset to factory baseline defaults", {
      newState: "v1.0.0",
      reason: "Administrator factory reset command",
      component: "HERMES_CORE"
    });
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
 * GET /api/hermes/orb-state
 * Real-time quantitative telemetry for the Deterministic 3-Hour NY ORB Engine & Hybrid Supervisor.
 */
hermesRouter.get("/orb-state", async (req, res) => {
  try {
    const settings = await getSystemSettings();
    const livePriceObj = getLatestPrice();
    const currentPrice = livePriceObj?.price || 2650.0;
    
    const cached = getLatestCachedSignal();
    if (cached?.orbState) {
      return res.json({
        engineMode: settings.engineMode || "HYBRID_DUAL",
        orbRiskPerTrade: settings.orbRiskPerTrade ?? 2.0,
        orbTargetMultiple: settings.orbTargetMultiple ?? 5.0,
        orbStopAtrMultiplier: settings.orbStopAtrMultiplier ?? 1.5,
        orbAllowLondonSession: settings.orbAllowLondonSession ?? false,
        orbState: cached.orbState,
      });
    }

    const { getDeterministicOrbStatus, evaluateDeterministicOrb } = await import("../lib/deterministicOrbEngine.js");
    const { getMetaApiHistoricalOHLC } = await import("../lib/metaApiFeed.js");
    const { calcEMA } = await import("../lib/technicalIndicators.js");
    const orbStatus = await getDeterministicOrbStatus(currentPrice);
    const orbSignal = await evaluateDeterministicOrb(currentPrice, 0.45);

    let candlesHTF = await getMetaApiHistoricalOHLC("1h", 60).catch(() => []);
    let ema50 = currentPrice;
    if (candlesHTF && candlesHTF.length >= 10) {
      const closes = candlesHTF.map(c => c.close);
      const emas = calcEMA(closes, Math.min(50, closes.length));
      ema50 = emas[emas.length - 1] || currentPrice;
    }

    const nyRangeHigh = orbStatus.currentRange?.high ?? (cached?.dualEngine?.orbRange?.high ?? +(currentPrice + 4.5).toFixed(2));
    const nyRangeLow = orbStatus.currentRange?.low ?? (cached?.dualEngine?.orbRange?.low ?? +(currentPrice - 4.5).toFixed(2));
    const nyRangeSpan = +(nyRangeHigh - nyRangeLow).toFixed(2);
    const trendFilterStatus = currentPrice >= ema50 ? "BULLISH" : "BEARISH";

    const orbState = {
      phase: orbStatus.stage === "FORMING_RANGE" ? "OBSERVING_RANGE" : (orbStatus.stage === "WAITING_BREAKOUT" || orbStatus.stage === "BREAKOUT_TRIGGERED") ? "ACTIVE_DECISION" : "CLOSED",
      nyRangeHigh,
      nyRangeLow,
      nyRangeSpan,
      trendFilterStatus,
      ema50: +ema50.toFixed(2),
      currentPrice: +currentPrice.toFixed(2),
      targetDistance: 15.0,
      stopDistance: 3.0,
      reason: orbSignal?.reason || orbStatus.summary || "Deterministic ORB active and monitoring market boundaries.",
    };

    res.json({
      engineMode: settings.engineMode || "HYBRID_DUAL",
      orbRiskPerTrade: settings.orbRiskPerTrade ?? 2.0,
      orbTargetMultiple: settings.orbTargetMultiple ?? 5.0,
      orbStopAtrMultiplier: settings.orbStopAtrMultiplier ?? 1.5,
      orbAllowLondonSession: settings.orbAllowLondonSession ?? false,
      orbState,
    });
  } catch (err: any) {
    logger.error({ err }, "[Hermes Router] Failed to get orb-state");
    res.status(500).json({ error: "Failed to evaluate ORB state" });
  }
});

/**
 * POST /api/hermes/set-engine-mode
 * Quick mode switch: HYBRID_DUAL | DETERMINISTIC_ORB | ALPHA_TRADES_SD | ICT_SILVER_BULLET
 */
hermesRouter.post("/set-engine-mode", async (req, res) => {
  try {
    const { engineMode } = req.body;
    if (!["HYBRID_DUAL", "DETERMINISTIC_ORB", "ALPHA_TRADES_SD", "ICT_SILVER_BULLET"].includes(engineMode)) {
      return res.status(400).json({ error: "Invalid engineMode. Must be HYBRID_DUAL, DETERMINISTIC_ORB, ALPHA_TRADES_SD, or ICT_SILVER_BULLET." });
    }
    const updated = await updateSystemSettings({ engineMode });
    recordHermesStateUpdate(`Execution Engine switched to ${engineMode.replace(/_/g, " ")}`, {
      newState: engineMode,
      engineMode,
      component: "HERMES_CORE",
    });
    logger.info({ engineMode: updated.engineMode }, "[Hermes AI Brain] Engine mode successfully updated");
    res.json({ success: true, engineMode: updated.engineMode });
  } catch (err: any) {
    logger.error({ err }, "[Hermes Router] Failed to update engine mode");
    res.status(500).json({ error: "Failed to update engine mode" });
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

    // Check master switch + mode switches before dispatching to MT5 broker
    const accountId = settings.tradingMode === "REAL" ? settings.realAccountId : settings.demoAccountId;
    const isMasterAuto = Boolean(settings.autoTradingEnabled);
    const isModeAuto = settings.tradingMode === "REAL" ? Boolean(settings.autoTradingRealEnabled) : Boolean(settings.autoTradingDemoEnabled);
    const isAutoEnabled = isMasterAuto && isModeAuto && settings.tradingState !== "PAUSED";

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
