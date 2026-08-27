import { getRunningTrades, updateTradeStatus, updateTradeStopLoss } from "@workspace/db";
import { getLatestPrice } from "./priceEvents.js";
import { logger } from "./logger.js";
import { modifyOpenPositionsStopLoss } from "./metaApiFeed.js";

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
    const runningTrades = await getRunningTrades();

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
        } else {
          // Trailing SL: When trade reaches 50% of the distance to TP, lock in exactly +2 points of profit
          const distanceToTarget = +(takeProfit - entryPrice).toFixed(2);
          const currentProfit = +(currentPrice - entryPrice).toFixed(2);
          const halfwayDistance = distanceToTarget * 0.5;

          if (distanceToTarget > 0 && currentProfit >= halfwayDistance) {
            const targetSl = +(entryPrice + 2.0).toFixed(2); // Lock in exactly +2 points of profit
            if (stopLoss < targetSl) {
              await updateTradeStopLoss(id as string, targetSl);
              await modifyOpenPositionsStopLoss("LONG", targetSl);
              logger.info(
                { id, signal, entryPrice, currentPrice, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                "Trailing Stop Loss: 50% target distance reached — locked in +2.0 points profit"
              );
            }
          }
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
        } else {
          // Trailing SL: When trade reaches 50% of the distance to TP, lock in exactly +2 points of profit
          const distanceToTarget = +(entryPrice - takeProfit).toFixed(2);
          const currentProfit = +(entryPrice - currentPrice).toFixed(2);
          const halfwayDistance = distanceToTarget * 0.5;

          if (distanceToTarget > 0 && currentProfit >= halfwayDistance) {
            const targetSl = +(entryPrice - 2.0).toFixed(2); // Lock in exactly +2 points of profit
            if (stopLoss > targetSl) {
              await updateTradeStopLoss(id as string, targetSl);
              await modifyOpenPositionsStopLoss("SHORT", targetSl);
              logger.info(
                { id, signal, entryPrice, currentPrice, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                "Trailing Stop Loss: 50% target distance reached — locked in +2.0 points profit"
              );
            }
          }
        }
      }

      if (newStatus && closedPrice !== null && pnlPoints !== null) {
        await updateTradeStatus(id as string, newStatus, closedPrice, pnlPoints);

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
