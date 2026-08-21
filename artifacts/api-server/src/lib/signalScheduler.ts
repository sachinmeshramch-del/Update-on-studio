import { generateSignal } from "./signalEngine.js";
import { getLatestPrice } from "./priceEvents.js";
import { fetchGoldPrice } from "./goldPrice.js";
import { db, signalsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { sendPushToAll } from "./pushNotifications.js";
import { logger } from "./logger.js";

const SCHEDULER_INTERVAL = 60_000; // 60 seconds

async function runScheduledSignal(): Promise<void> {
  try {
    const live  = getLatestPrice();
    const price = live?.price ?? (await fetchGoldPrice()).price;

    const signal = await generateSignal(price);

    if (signal.signal === "HOLD") return;

    // ── Deduplication guard (DB-backed, survives restarts) ─────────────────
    // Do NOT insert if there is already a RUNNING signal in the same direction.
    // This prevents duplicate rows caused by server restarts resetting in-memory
    // cooldown state while the signal engine's cache replays the same signal.
    try {
      const existing = await db
        .select({ id: signalsTable.id })
        .from(signalsTable)
        .where(
          and(
            eq(signalsTable.tradeStatus, "RUNNING"),
            eq(signalsTable.signal, signal.signal),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        logger.info(
          { existingId: existing[0].id, direction: signal.signal },
          "Scheduler: RUNNING signal already open in this direction — skipping insert",
        );
        return;
      }
    } catch (checkErr) {
      // If the check itself fails, skip the insert (safe default)
      logger.warn({ checkErr }, "Scheduler: RUNNING-signal check failed — skipping insert");
      return;
    }

    try {
      await db.insert(signalsTable).values({
        signal:        signal.signal,
        confidence:    signal.confidence,
        entryPrice:    signal.entryPrice,
        stopLoss:      signal.stopLoss,
        takeProfit:    signal.takeProfit,
        trend:         signal.trend,
        reason:        signal.reason,
        tradeDuration: signal.tradeDuration,
      });
    } catch (dbErr) {
      logger.warn({ dbErr }, "Scheduler: failed to persist signal");
    }

    const direction = signal.signal as "LONG" | "SHORT";
    const emoji     = direction === "LONG" ? "📈" : "📉";

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
    logger.warn({ err }, "Signal scheduler tick failed");
  }
}

export function startSignalScheduler(): void {
  logger.info("Signal scheduler started");
  const id = setInterval(runScheduledSignal, SCHEDULER_INTERVAL);
  if (typeof id === "object" && "unref" in id) (id as any).unref();
}
