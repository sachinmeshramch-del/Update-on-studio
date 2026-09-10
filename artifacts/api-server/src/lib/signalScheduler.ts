import { generateSignal } from "./signalEngine.js";
import { getLatestPrice, priceEmitter, type LivePrice } from "./priceEvents.js";
import { insertSignal, getLatestSignal, getRunningTrades, updateTradeStatus } from "@workspace/db";
import { sendPushToAll } from "./pushNotifications.js";
import { sendTelegramNotification } from "./telegram.js";
import { logger } from "./logger.js";
import { getSystemSettings } from "@workspace/db";
import { getMetaApiStatus, executeTradeOnAccount, closeAllPositions } from "./metaApiFeed.js";
import { executeTradeWithCapitalManagement } from "./autoTrader.js";

const SCHEDULER_INTERVAL = 1_000; // 1 second polling for rapid signal generation
let lastTickEvaluatedAt = 0;
let lastTickPrice = 0;
const MIN_TICK_EVALUATION_GAP = 1200; // 1.2s debounce to allow indicators to compute smoothly

let isScheduling = false;

let isRolloverClosing = false;
let rolloverClosedDate = "";

async function checkDailyRolloverAndClose(): Promise<void> {
    if (isRolloverClosing) return;
    isRolloverClosing = true;
    try {
        const now = new Date();
        const nyFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            hour12: false,
            hour: "numeric",
            minute: "numeric",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            weekday: "short"
        });
        const parts = nyFormatter.formatToParts(now);
        let nyHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
        if (nyHour === 24) nyHour = 0;
        const nyMin = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
        const nyDayStr = parts.find(p => p.type === 'weekday')?.value;
        const currentDateKey = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;

        // 15 minutes before 5 PM NY time = 16:45 NY time
        // Weekend close check: Friday at 16:45. Daily check: Mon-Thu at 16:45
        if (nyHour === 16 && nyMin >= 45 && nyDayStr !== 'Sat' && nyDayStr !== 'Sun') {
            if (rolloverClosedDate !== currentDateKey) {
                logger.info("[Rollover Check] Approaching daily/weekend rollover. Auto-closing all open positions.");
                const settings = await getSystemSettings();
                
                if (settings.autoTradingDemoEnabled && settings.demoAccountId) {
                    await closeAllPositions(settings.demoAccountId);
                }
                if (settings.autoTradingRealEnabled && settings.realAccountId) {
                    await closeAllPositions(settings.realAccountId);
                }
                
                // Mark running trades in DB as closed
                const running = await getRunningTrades();
                const currentPrice = getLatestPrice()?.price || 0;
                for (const trade of running) {
                    if (trade.id) {
                        await updateTradeStatus(trade.id, "CLOSED", currentPrice, 0);
                        logger.info({ tradeId: trade.id }, "Marked trade as CLOSED due to rollover");
                    }
                }

                rolloverClosedDate = currentDateKey;
            }
        }
    } catch (e: any) {
        logger.error({ err: e.message || e }, "Rollover check failed");
    } finally {
        isRolloverClosing = false;
    }
}

async function runScheduledSignal(): Promise<void> {
  if (isScheduling) return;
  isScheduling = true;
  try {
    await checkDailyRolloverAndClose();

    const live  = getLatestPrice();
    const price = live?.price;
    if (!price || !live) {
      logger.warn("Skipping signal evaluation: no live price available");
      return;
    }

    // ── Feed Staleness & Market Closure Guard ──
    // If the broker stops sending quotes (e.g. daily break, weekend, or holiday like Labor Day),
    // the live feed will go stale. We pause signals to prevent the bot from hallucinating on old data.
    const msSinceLastPrice = Date.now() - live.ms;
    if (msSinceLastPrice > 5 * 60 * 1000) {
        // Log once every 5 minutes to avoid spam
        if (Date.now() % (5 * 60 * 1000) < 5000) {
            logger.warn({ msSinceLastPrice }, "Skipping signal evaluation: Price feed is stale (market likely closed for holiday or daily break)");
        }
        return;
    }

    const signal = await generateSignal(price, true);

    // ── Circuit Breaker & HOLD Guard ─────────────────────────────────────────
    if (signal.signal === "HOLD" || signal.circuitBreakerActive) {
      if (signal.circuitBreakerActive) {
        logger.info(
          { cooldownMins: signal.circuitBreakerRemainingMinutes, consecutiveLosses: signal.consecutiveLosses },
          "Scheduler: Circuit Breaker active — trade execution strictly blocked"
        );
      }
      return;
    }

    // ── Deduplication Guard (Scheduler Level) ───────────────────────────────
    try {
      const latest = await getLatestSignal();
      if (latest && latest.signal === signal.signal) {
        const msSince = Date.now() - latest.createdAt.getTime();
        if (msSince < 5 * 60 * 1000) {
          logger.info({ signal: signal.signal, msSince }, "Scheduler: Suppressing duplicate signal (fired within 5 min)");
          return;
        }
      }
      const running = await getRunningTrades();
      if (running.length > 0) {
        logger.info({ runningCount: running.length, newSignal: signal.signal }, "Scheduler: Suppressing signal (a trade is already active)");
        return;
      }
    } catch (checkErr) {
      logger.warn({ checkErr }, "Scheduler: Failed to check DB deduplication");
    }

    // ── Auto-Trading MetaApi Order Execution (Ultra-Fast Concurrent Dispatch) ──────
    const tradePromises: Promise<any>[] = [];
    const signalDetectedAt = Date.now();

    try {
      const settings = await getSystemSettings();

      // 1. Real Account Execution (Concurrent)
      if (settings.autoTradingRealEnabled) {
        const realId = settings.realAccountId?.trim();
        if (realId) {
          logger.info({ direction: signal.signal, entry: signal.entryPrice, sl: signal.stopLoss, tp: signal.takeProfit, accountId: realId }, "[MetaApi Execution] Dispatching trade to REAL MT5 account immediately...");
          tradePromises.push(
            executeTradeWithCapitalManagement(realId, "REAL", signal.signal, signal.stopLoss, signal.takeProfit, signal.entryPrice, settings, signalDetectedAt)
              .catch((realErr: any) => logger.error({ err: realErr?.message || realErr, accountId: realId }, "[MetaApi Execution] REAL trade execution failed"))
          );
        } else {
          logger.warn("[MetaApi Execution] Auto-trading (Real) is ON, but Real Account ID is not configured in settings.");
        }
      }

      // 2. Demo Account Execution (Concurrent)
      if (settings.autoTradingDemoEnabled) {
        const demoId = settings.demoAccountId?.trim();
        if (demoId) {
          logger.info({ direction: signal.signal, entry: signal.entryPrice, sl: signal.stopLoss, tp: signal.takeProfit, accountId: demoId }, "[MetaApi Execution] Dispatching trade to DEMO MT5 account concurrently...");
          tradePromises.push(
            executeTradeWithCapitalManagement(demoId, "DEMO", signal.signal, signal.stopLoss, signal.takeProfit, signal.entryPrice, settings, signalDetectedAt)
              .catch((demoErr: any) => logger.error({ err: demoErr?.message || demoErr, accountId: demoId }, "[MetaApi Execution] DEMO trade execution failed"))
          );
        } else {
          logger.warn("[MetaApi Execution] Auto-trading (Demo) is ON, but Demo Account ID is not configured in settings.");
        }
      }
    } catch (e: any) {
      logger.error({ err: e.message || e }, "Failed to evaluate auto-trade execution");
    }

    // Persist signal concurrently so database write latency doesn't delay broker execution
    const dbPersistPromise = insertSignal({
      signal:        signal.signal,
      confidence:    signal.confidence,
      entryPrice:    signal.entryPrice,
      stopLoss:      signal.stopLoss,
      takeProfit:    signal.takeProfit,
      trend:         signal.trend,
      reason:        signal.reason,
      tradeDuration: signal.tradeDuration,
      tradeStatus:   "RUNNING",
      closedPrice:   null,
      closedAt:      null,
      pnlPoints:     null,
      marketStructure: null,
      bosPresent: null,
      liquiditySweep: null,
      inOrderBlock: null,
      smcScore: null,
      obScore: null,
      obType: null,
      obHigh: null,
      obLow: null,
      signalType:    signal.signalType,
      candlePattern: null,
      candleScore: null
    }).catch((dbErr: any) => {
      logger.warn({ dbErr }, "Scheduler: failed to persist signal");
    });

    // Await both broker orders and persistence
    await Promise.allSettled([...tradePromises, dbPersistPromise]);

    const direction = signal.signal as "LONG" | "SHORT";
    const emoji     = direction === "LONG" ? "📈" : "📉";

    const tgMessage = `🚨 <b>Gold Signal: ${direction}</b>

Entry: ${signal.entryPrice.toFixed(2)}
Target (TP): ${signal.takeProfit.toFixed(2)}
Stop Loss: ${signal.stopLoss.toFixed(2)}
Confidence: ${signal.confidence}%

Reason: ${signal.reason}`;
    await sendTelegramNotification(tgMessage);

    await sendPushToAll({
      type:       "signal",
      signal:     direction,
      confidence: signal.confidence,
      entryPrice: signal.entryPrice,
      stopLoss:   signal.stopLoss,
      takeProfit: signal.takeProfit,
      reason:     signal.reason,
      title:      `${emoji} Gold Signal: ${direction}`,
      body:       `Entry $${signal.entryPrice.toFixed(2)} · TP $${signal.takeProfit.toFixed(2)} · SL $${signal.stopLoss.toFixed(2)} · ${signal.confidence}% conf`,
    });

    logger.info({ signal: direction, confidence: signal.confidence }, "Scheduled signal pushed");
  } catch (err) {
    if (err instanceof Error && (err.message.includes('MetaApi is not connected') || err.message.includes('status code 500'))) {
      // Ignore gracefully
    } else {
      logger.warn({ err: err instanceof Error ? err.message : err }, "Signal scheduler tick failed");
    }
  } finally {
    isScheduling = false;
  }
}

function handleLivePriceTick(live: LivePrice): void {
  const now = Date.now();
  if (now - lastTickEvaluatedAt < MIN_TICK_EVALUATION_GAP) return;

  const priceDiff = Math.abs(live.price - lastTickPrice);
  // Trigger signal evaluation immediately if price moves by at least 25 cents or 3.5s elapsed
  if (priceDiff >= 0.25 || (now - lastTickEvaluatedAt >= 3500)) {
    lastTickEvaluatedAt = now;
    lastTickPrice = live.price;
    runScheduledSignal().catch(() => {});
  }
}

export function startSignalScheduler(): void {
  logger.info("Signal scheduler started with event-driven streaming price triggers");
  priceEmitter.on("price", handleLivePriceTick);
  const id = setInterval(runScheduledSignal, SCHEDULER_INTERVAL);
  if (typeof id === "object" && "unref" in id) (id as any).unref();
}
