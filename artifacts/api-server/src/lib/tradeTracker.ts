import { db, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getLatestPrice } from "./priceEvents.js";
import { logger } from "./logger.js";

const TRACKER_INTERVAL = 10_000; // 10 seconds

async function checkRunningTrades() {
  // ── Price guard: WebSocket-only ────────────────────────────────────────────
  // We deliberately do NOT fall back to HTTP price sources here.
  // HTTP sources (goldprice.org, Yahoo) can return stale or momentarily-spiked
  // values — especially at startup when WebSocket is still connecting — and
  // a single bad tick can permanently mis-close a trade. We only evaluate trade
  // outcomes when a verified live WebSocket price is present. If none exists,
  // skip this cycle entirely; the next tick (10 s later) will have a fresh price.
  const live = getLatestPrice();
  if (!live) {
    logger.debug("Trade tracker: no live WebSocket price yet — skipping this cycle");
    return;
  }
  const currentPrice = live.price;

  try {
    const runningTrades = await db
      .select()
      .from(signalsTable)
      .where(eq(signalsTable.tradeStatus, "RUNNING"));

    if (runningTrades.length === 0) return;

    for (const trade of runningTrades) {
      const { id, signal, entryPrice, stopLoss, takeProfit } = trade;

      let newStatus:   string | null = null;
      let closedPrice: number | null = null;
      let pnlPoints:   number | null = null;

      if (signal === "LONG") {
        if (currentPrice >= takeProfit) {
          newStatus   = "TARGET_HIT";
          closedPrice = takeProfit;
          pnlPoints   = +(takeProfit - entryPrice).toFixed(2);
        } else if (currentPrice <= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = stopLoss;
          pnlPoints   = +(stopLoss - entryPrice).toFixed(2);
        }
      } else if (signal === "SHORT") {
        if (currentPrice <= takeProfit) {
          newStatus   = "TARGET_HIT";
          closedPrice = takeProfit;
          pnlPoints   = +(entryPrice - takeProfit).toFixed(2);
        } else if (currentPrice >= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = stopLoss;
          pnlPoints   = +(entryPrice - stopLoss).toFixed(2);
        }
      }

      if (newStatus && closedPrice !== null && pnlPoints !== null) {
        await db
          .update(signalsTable)
          .set({ tradeStatus: newStatus, closedPrice, closedAt: new Date(), pnlPoints })
          .where(eq(signalsTable.id, id));

        logger.info({ id, signal, newStatus, closedPrice, pnlPoints }, "Scalp trade outcome updated");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Trade tracker update error");
  }
}

export function startTradeTracker() {
  // ── No immediate call on startup ───────────────────────────────────────────
  // The first interval fires 10 s after startup, by which time both WebSocket
  // sources (TwelveData + Finnhub) will have delivered at least one price tick.
  // Running immediately caused false closes: getLatestPrice() returns null in
  // the first ~700 ms before any WS tick arrives, so the tracker fell back to
  // an HTTP price fetch that could return a spiked / stale value.
  logger.info("Scalp trade tracker started (10s interval, first check in 10s)");
  setInterval(checkRunningTrades, TRACKER_INTERVAL);
}
