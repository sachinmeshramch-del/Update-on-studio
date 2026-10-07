import { generateSignal, commitSignal } from "./signalEngine.js";
import { getLatestPrice, priceEmitter, type LivePrice } from "./priceEvents.js";
import { insertSignal, getLatestSignal, getRunningTrades, updateTradeStatus } from "@workspace/db";
import { sendPushToAll } from "./pushNotifications.js";
import { sendTelegramNotification } from "./telegram.js";
import { logger } from "./logger.js";
import { getSystemSettings } from "@workspace/db";
import { getMetaApiStatus, executeTradeOnAccount, closeAllPositions, getOpenBrokerPositions, getMetaApiLatency } from "./metaApiFeed.js";
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
    logger.info("Scheduler running check...");
    await checkDailyRolloverAndClose();

    let live  = getLatestPrice();
    if (!live) {
      try {
        const { getMetaApiHistoricalOHLC, getLivePrice } = await import("./metaApiFeed.js");
        
        // 1. First check if streaming terminal already has a live price
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
            const { setLatestPrice } = await import("./priceEvents.js");
            setLatestPrice(live);
        } else {
            // 2. Fallback to 1m candle
            const recent = await getMetaApiHistoricalOHLC("1m", 1).catch(() => []);
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
                    timestamp: new Date().toISOString(),
                    direction: "unchanged",
                    ms: Date.now(),
                    source: "metaapi"
                };
                // Seed the emitter so it's not null next time
                const { setLatestPrice } = await import("./priceEvents.js");
                setLatestPrice(live);
            }
        }
      } catch (e: any) {
        logger.debug({ err: e?.message || e }, "Fallback price fetch pending (feed initializing or market closed)");
      }
    }
    
    const price = live?.price;
    const spread = live?.spread || 0.50;
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

    const signal = await generateSignal(price, false, spread);

    // ── High Latency Circuit Breaker ─────────────────────────────────────────
    const latencyMs = getMetaApiLatency();
    if (latencyMs > 2000) {
        if (Date.now() % (15 * 1000) < 5000) {
            logger.warn({ latencyMs }, "Scheduler: Auto-trading paused due to high MetaApi connection latency (>2000ms)");
        }
        return;
    }

    // ── Circuit Breaker & HOLD Guard ─────────────────────────────────────────
    if (signal.signal === "HOLD" || signal.circuitBreakerActive) {
      if (signal.signal === "HOLD") {
        logger.info({ reason: signal.reason }, "Scheduler: Holding signal");
      }
      if (signal.circuitBreakerActive) {
        logger.info(
          { cooldownMins: signal.circuitBreakerRemainingMinutes, consecutiveLosses: signal.consecutiveLosses },
          "Scheduler: Circuit Breaker active — trade execution strictly blocked"
        );
      }
      return;
    }

    // ── Deduplication Guard (Scheduler Level) ───────────────────────────────
    let settings: any = null;
    try {
      const [latest, running, brokerOpen, dbSettings] = await Promise.all([
          getLatestSignal().catch(() => null),
          getRunningTrades().catch(() => []),
          getOpenBrokerPositions().catch(() => []),
          getSystemSettings().catch(() => null)
      ]);
      settings = dbSettings;

      if (latest && latest.signal === signal.signal) {
        const msSince = Date.now() - latest.createdAt.getTime();
        if (msSince < 5 * 60 * 1000) {
          logger.info({ signal: signal.signal, msSince }, "Scheduler: Suppressing duplicate signal (fired within 5 min)");
          return;
        }
      }

      if (running.length > 0 || brokerOpen.length > 0) {
        logger.info({ dbRunning: running.length, brokerRunning: brokerOpen.length, newSignal: signal.signal }, "Scheduler: Suppressing signal (a trade is already active either in DB or MT5)");
        return;
      }
    } catch (checkErr) {
      logger.warn({ checkErr }, "Scheduler: Failed to check DB deduplication");
    }

    // ── Auto-Trading MetaApi Order Execution (Ultra-Fast Concurrent Dispatch) ──────
    const tradePromises: Promise<any>[] = [];
    let isRealTradeExecuted = false;
    let brokerPositionId: string | null = null;
    const signalDetectedAt = Date.now();

    try {
      // 1. Real Account Execution (Concurrent)
      const isRealAuto = settings ? Boolean(settings.autoTradingRealEnabled || settings.autoTradingEnabled) : false;
      if (isRealAuto) {
        const realId = settings.realAccountId?.trim();
        if (realId) {
          logger.info({ direction: signal.signal, entry: signal.entryPrice, sl: signal.stopLoss, tp: signal.takeProfit, accountId: realId }, "[MetaApi Execution] Dispatching trade to REAL MT5 account immediately...");
          tradePromises.push(
            executeTradeWithCapitalManagement(realId, "REAL", signal.signal, signal.stopLoss, signal.takeProfit, signal.entryPrice, settings, signalDetectedAt)
              .catch((realErr: any) => {
                logger.error({ err: realErr?.message || realErr, accountId: realId }, "[MetaApi Execution] REAL trade execution failed");
                return { executed: false, error: realErr?.message || String(realErr) };
              })
          );
        } else {
          logger.warn("[MetaApi Execution] Auto-trading (Real) is ON, but Real Account ID is not configured in settings.");
        }
      }
    } catch (e: any) {
      logger.error({ err: e.message || e }, "Failed to evaluate auto-trade execution");
    }

    // Wait for broker dispatch to verify execution status (fast response from MT5)
    if (tradePromises.length > 0) {
      const results = await Promise.allSettled(tradePromises);
      for (const res of results) {
        if (res.status === "fulfilled" && res.value?.executed) {
          isRealTradeExecuted = true;
          brokerPositionId = res.value.positionId ? String(res.value.positionId) : (res.value.orderId ? String(res.value.orderId) : null);
          break;
        }
      }
    }

    // Commit the signal to engine memory to reset cooldowns
    commitSignal(signal);
    
    // Persist signal with verified real execution status
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
      candleScore: null,
      isRealTrade: isRealTradeExecuted,
      brokerPositionId: brokerPositionId
    }).catch((dbErr: any) => {
      logger.warn({ dbErr }, "Scheduler: failed to persist signal");
    });

    // Await persistence
    await dbPersistPromise;

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

let debugTickCount = 0;
function handleLivePriceTick(live: LivePrice): void {
  debugTickCount++;
  if (debugTickCount % 50 === 0) logger.info({ price: live.price }, "[DEBUG] Received 50 live ticks");
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
