import { generateSignal } from "./signalEngine.js";
import { getLatestPrice } from "./priceEvents.js";
import { insertSignal, getLatestSignal, getRunningTrades } from "@workspace/db";
import { sendPushToAll } from "./pushNotifications.js";
import { sendTelegramNotification } from "./telegram.js";
import { logger } from "./logger.js";
import { getSystemSettings } from "@workspace/db";
import { getMetaApiStatus, executeTradeOnAccount } from "./metaApiFeed.js";
import { executeTradeWithCapitalManagement } from "./autoTrader.js";

const SCHEDULER_INTERVAL = 5_000; // 5 seconds

let isScheduling = false;
async function runScheduledSignal(): Promise<void> {
  if (isScheduling) return;
  isScheduling = true;
  try {
    const live  = getLatestPrice();
    const price = live?.price;
    if (!price) {
      logger.warn("Skipping signal evaluation: no live price available");
      return;
    }

    const signal = await generateSignal(price, true);

    if (signal.signal === "HOLD") return;

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
      if (running.some(r => r.signal === signal.signal)) {
        logger.info({ signal: signal.signal }, "Scheduler: Suppressing signal (running trade already active)");
        return;
      }
    } catch (checkErr) {
      logger.warn({ checkErr }, "Scheduler: Failed to check DB deduplication");
    }

    try {
      await insertSignal({
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
      });
    } catch (dbErr) {
      logger.warn({ dbErr }, "Scheduler: failed to persist signal");
    }

    // ── Auto-Trading MetaApi Order Execution (Demo & Real Distinguished) ──────
    try {
      const settings = await getSystemSettings();

      // 1. Demo Account Execution: strictly triggered only if Demo Auto Trading is ON
      if (settings.autoTradingDemoEnabled) {
                if (demoId) {
          logger.info({ direction: signal.signal, entry: signal.entryPrice, sl: signal.stopLoss, tp: signal.takeProfit, accountId: demoId }, "[MetaApi Execution] Automatically executing trade on DEMO MT5 account...");
          try {
            await executeTradeWithCapitalManagement(demoId, "DEMO", signal.signal, signal.stopLoss, signal.takeProfit, signal.entryPrice);
          } catch (demoErr: any) {
            logger.error({ err: demoErr.message || demoErr, accountId: demoId }, "[MetaApi Execution] DEMO trade execution failed");
          }
        } else {
          logger.warn("[MetaApi Execution] Auto-trading (Demo) is ON, but Demo Account ID is not configured in settings.");
        }
      }

      // 2. Real Account Execution: strictly triggered only if Real Auto Trading is ON
      if (settings.autoTradingRealEnabled) {
        const realId = settings.realAccountId?.trim();
        if (realId) {
          logger.info({ direction: signal.signal, entry: signal.entryPrice, sl: signal.stopLoss, tp: signal.takeProfit, accountId: realId }, "[MetaApi Execution] Automatically executing trade on REAL MT5 account...");
          try {
            await executeTradeWithCapitalManagement(realId, "REAL", signal.signal, signal.stopLoss, signal.takeProfit, signal.entryPrice);
          } catch (realErr: any) {
            logger.error({ err: realErr.message || realErr, accountId: realId }, "[MetaApi Execution] REAL trade execution failed");
          }
        } else {
          logger.warn("[MetaApi Execution] Auto-trading (Real) is ON, but Real Account ID is not configured in settings.");
        }
      }
    } catch (e: any) {
      logger.error({ err: e.message || e }, "Failed to evaluate auto-trade execution");
    }

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

export function startSignalScheduler(): void {
  logger.info("Signal scheduler started");
  const id = setInterval(runScheduledSignal, SCHEDULER_INTERVAL);
  if (typeof id === "object" && "unref" in id) (id as any).unref();
}
