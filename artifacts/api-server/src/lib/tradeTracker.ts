import { getRunningTrades, updateTradeStatus, updateTradeStopLoss } from "@workspace/db";
import { getLatestPrice } from "./priceEvents.js";
import { logger } from "./logger.js";
import {
  modifyOpenPositionsStopLoss,
  getOpenBrokerPositions,
  getRecentlyClosedBrokerDeals,
  closeBrokerPosition,
  type BrokerPosition,
  type BrokerClosedDeal
} from "./metaApiFeed.js";

const TRACKER_INTERVAL = 10_000; // 10 seconds

async function checkRunningTrades() {
  const live = getLatestPrice();
  if (!live) {
    logger.debug("Trade tracker: no live WebSocket price yet — skipping this cycle");
    return;
  }
  const currentPrice = live.price;
  const currentSpread = live.spread || 0.90;

  try {
    const runningTrades = await getRunningTrades();
    if (runningTrades.length === 0) return;

    // Fetch open positions and recently closed deals across all active MT5 broker accounts
    const [brokerPositions, recentClosedDeals] = await Promise.all([
      getOpenBrokerPositions().catch(() => [] as BrokerPosition[]),
      getRecentlyClosedBrokerDeals(new Date(Date.now() - 6 * 3600 * 1000)).catch(() => [] as BrokerClosedDeal[])
    ]);

    for (const trade of runningTrades) {
      const { id, signal, entryPrice, stopLoss, takeProfit, createdAt } = trade;
      const tradeTimestamp = createdAt ? new Date(createdAt).getTime() : 0;

      // ── 1. Match against open broker positions ─────────────────────────────
      // Match by direction and price proximity (within 3 points to account for spread/slippage)
      const matchingOpenPos = brokerPositions.find(p =>
        p.type === signal && Math.abs(p.openPrice - entryPrice) <= 3.0
      );

      // ── 2. Check if broker already executed the close on MT5 ────────────────
      // If there is no open position on the broker, check if an exit deal exists
      if (!matchingOpenPos && recentClosedDeals.length > 0) {
        const matchingDeal = recentClosedDeals.find(d => {
          const dealTime = new Date(d.time).getTime();
          // The deal must have occurred after or near the signal creation time
          if (tradeTimestamp > 0 && dealTime < tradeTimestamp - 30_000) return false;
          // In MT5, an exit deal (DEAL_ENTRY_OUT) for a BUY position is DEAL_TYPE_SELL, and vice versa
          const isExitType = (signal === "LONG" && d.type === "DEAL_TYPE_SELL") ||
                             (signal === "SHORT" && d.type === "DEAL_TYPE_BUY");
          // Deal price should be plausible for this trade
          const pricePlausible = Math.abs(d.price - entryPrice) <= 25.0;
          return isExitType && pricePlausible;
        });

        if (matchingDeal) {
          const isTp = matchingDeal.reason === "DEAL_REASON_TP" ||
                       (matchingDeal.comment && matchingDeal.comment.toLowerCase().includes("tp")) ||
                       (signal === "LONG" && matchingDeal.price >= takeProfit - 0.5) ||
                       (signal === "SHORT" && matchingDeal.price <= takeProfit + 0.5);

          const finalStatus = isTp ? "TARGET_HIT" : "STOP_HIT";
          const finalClosedPrice = matchingDeal.price;
          // Use exact broker profit in USD / points (e.g. -0.92, +3.50)
          const finalPnl = matchingDeal.profit;

          await updateTradeStatus(id as string, finalStatus, finalClosedPrice, finalPnl);
          logger.info(
            { id, signal, finalStatus, finalClosedPrice, finalPnl, dealId: matchingDeal.id, comment: matchingDeal.comment },
            "[Broker Sync] Synced trade outcome with real MetaTrader/XM deal execution!"
          );
          continue;
        }
      }

      // ── 3. Active Position or Simulation Tracking ───────────────────────────
      // If we have an open broker position, use its actual filled openPrice
      const actualEntry = matchingOpenPos?.openPrice || entryPrice;

      let newStatus:   string | null = null;
      let closedPrice: number | null = null;
      let pnlPoints:   number | null = null;

      if (signal === "LONG") {
        if (currentPrice >= takeProfit) {
          newStatus   = "TARGET_HIT";
          closedPrice = takeProfit;
          pnlPoints   = +(takeProfit - actualEntry).toFixed(2);
          if (matchingOpenPos) {
            await closeBrokerPosition(matchingOpenPos.id, matchingOpenPos.accountId);
          }
        } else if (currentPrice <= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = currentPrice;
          pnlPoints   = +(closedPrice - actualEntry).toFixed(2);
          if (matchingOpenPos) {
            await closeBrokerPosition(matchingOpenPos.id, matchingOpenPos.accountId);
          }
        } else {
          // Dynamic Trailing Stop Loss
          const distanceToTarget = +(takeProfit - actualEntry).toFixed(2);
          const currentProfit = +(currentPrice - actualEntry).toFixed(2);

          if (distanceToTarget > 0) {
            let targetSl = stopLoss;

            // Phase 1: At 25% to TP, move to TRUE BREAK-EVEN
            // Crucial: Must cover the spread + buffer (+0.15) so it NEVER exits at a loss!
            if (currentProfit >= distanceToTarget * 0.25 && currentProfit < distanceToTarget * 0.5) {
              const breakEvenPrice = +(actualEntry + currentSpread + 0.15).toFixed(2);
              targetSl = Math.max(stopLoss, breakEvenPrice);
            }
            // Phase 2: At 50% to TP, lock in 25% of target profit
            else if (currentProfit >= distanceToTarget * 0.5 && currentProfit < distanceToTarget * 0.75) {
              targetSl = +(actualEntry + (distanceToTarget * 0.25)).toFixed(2);
            }
            // Phase 3: At 75% to TP, lock in 50% of target profit
            else if (currentProfit >= distanceToTarget * 0.75) {
              targetSl = +(actualEntry + (distanceToTarget * 0.5)).toFixed(2);
            }

            if (targetSl > stopLoss) {
              await updateTradeStopLoss(id as string, targetSl);
              await modifyOpenPositionsStopLoss("LONG", targetSl);
              logger.info(
                { id, signal, entryPrice: actualEntry, currentPrice, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                "Trailing Stop Loss: Dynamic trailing level updated on MT5 and DB"
              );
            }
          }
        }
      } else if (signal === "SHORT") {
        if (currentPrice <= takeProfit) {
          newStatus   = "TARGET_HIT";
          closedPrice = takeProfit;
          pnlPoints   = +(actualEntry - takeProfit).toFixed(2);
          if (matchingOpenPos) {
            await closeBrokerPosition(matchingOpenPos.id, matchingOpenPos.accountId);
          }
        } else if (currentPrice >= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = currentPrice;
          pnlPoints   = +(actualEntry - closedPrice).toFixed(2);
          if (matchingOpenPos) {
            await closeBrokerPosition(matchingOpenPos.id, matchingOpenPos.accountId);
          }
        } else {
          // Dynamic Trailing Stop Loss
          const distanceToTarget = +(actualEntry - takeProfit).toFixed(2);
          const currentProfit = +(actualEntry - currentPrice).toFixed(2);

          if (distanceToTarget > 0) {
            let targetSl = stopLoss;

            // Phase 1: At 25% to TP, move to TRUE BREAK-EVEN
            // Crucial: Must cover spread so it never closes in a loss!
            if (currentProfit >= distanceToTarget * 0.25 && currentProfit < distanceToTarget * 0.5) {
              const breakEvenPrice = +(actualEntry - currentSpread - 0.15).toFixed(2);
              targetSl = Math.min(stopLoss, breakEvenPrice);
            }
            // Phase 2: At 50% to TP, lock in 25% of target profit
            else if (currentProfit >= distanceToTarget * 0.5 && currentProfit < distanceToTarget * 0.75) {
              targetSl = +(actualEntry - (distanceToTarget * 0.25)).toFixed(2);
            }
            // Phase 3: At 75% to TP, lock in 50% of target profit
            else if (currentProfit >= distanceToTarget * 0.75) {
              targetSl = +(actualEntry - (distanceToTarget * 0.5)).toFixed(2);
            }

            if (targetSl < stopLoss) {
              await updateTradeStopLoss(id as string, targetSl);
              await modifyOpenPositionsStopLoss("SHORT", targetSl);
              logger.info(
                { id, signal, entryPrice: actualEntry, currentPrice, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                "Trailing Stop Loss: Dynamic trailing level updated on MT5 and DB"
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
  logger.info("Scalp trade tracker started (10s interval, first check in 10s)");
  setInterval(checkRunningTrades, TRACKER_INTERVAL);
}

