import { getRunningTrades, updateTradeStatus, updateTradeStopLoss } from "@workspace/db";
import { getLatestPrice, priceEmitter, type LivePrice } from "./priceEvents.js";
import { logger } from "./logger.js";
import {
  modifyOpenPositionsStopLoss,
  getOpenBrokerPositions,
  getRecentlyClosedBrokerDeals,
  closeBrokerPosition,
  brokerEvents,
  type BrokerPosition,
  type BrokerClosedDeal
} from "./metaApiFeed.js";

const AUDIT_INTERVAL = 8_000; // 8 seconds fail-safe heartbeat audit
let cachedRunningTrades: any[] = [];
let lastDbSyncTime = 0;
let isEvaluating = false;
const trailingSLInFlight = new Set<string>();
let lastTickCheckTime = 0;
let lastEvaluatedTickPrice = 0;

export async function refreshRunningTradesCache(): Promise<any[]> {
  try {
    const trades = await getRunningTrades();
    cachedRunningTrades = trades || [];
    lastDbSyncTime = Date.now();
    return cachedRunningTrades;
  } catch (err) {
    logger.warn({ err }, "Trade tracker: failed to refresh running trades cache from DB");
    return cachedRunningTrades;
  }
}

/**
 * Handle instantaneous MT5 exit deal execution (TP / SL / Manual Close)
 * Triggered in <10ms directly from MetaApi streaming WebSocket
 */
async function handleBrokerDealClosed(deal: BrokerClosedDeal): Promise<void> {
  try {
    if (cachedRunningTrades.length === 0 && Date.now() - lastDbSyncTime > 1500) {
      await refreshRunningTradesCache();
    }
    if (cachedRunningTrades.length === 0) return;

    for (const trade of [...cachedRunningTrades]) {
      const { id, signal, entryPrice, stopLoss, takeProfit, createdAt } = trade;
      const tradeTimestamp = createdAt ? new Date(createdAt).getTime() : 0;
      const dealTime = new Date(deal.time).getTime();

      // Ensure deal occurred near or after trade creation
      if (tradeTimestamp > 0 && dealTime < tradeTimestamp - 30_000) continue;

      const isExitType = (signal === "LONG" && deal.type === "DEAL_TYPE_SELL") ||
                         (signal === "SHORT" && deal.type === "DEAL_TYPE_BUY");
                         
      // If we know the exact position ID, use it. Otherwise rely on time and the known deal openPrice
      const hasIdMatch = trade.brokerPositionId && deal.positionId === trade.brokerPositionId;
      const comparePrice = deal.openPrice || entryPrice;
      const pricePlausible = Math.abs(comparePrice - entryPrice) <= 15.0; // Tolerate up to 15 pts (150 pips) slippage

      if (hasIdMatch || (isExitType && pricePlausible)) {
        const isTp = deal.reason === "DEAL_REASON_TP" ||
                     (deal.comment && deal.comment.toLowerCase().includes("tp")) ||
                     (signal === "LONG" && deal.price >= takeProfit - 0.6) ||
                     (signal === "SHORT" && deal.price <= takeProfit + 0.6);

        const finalStatus = isTp ? "TARGET_HIT" : "STOP_HIT";
        const finalClosedPrice = deal.price;
        const netProfit = (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
        const finalPnl = (deal.profit !== undefined && deal.profit !== null && deal.profit !== 0) 
            ? Number(netProfit.toFixed(2)) 
            : Number((signal === "LONG" ? (deal.price - entryPrice) : (entryPrice - deal.price)).toFixed(2));

        // Remove from memory immediately to prevent double processing
        cachedRunningTrades = cachedRunningTrades.filter(t => t.id !== id);

        await updateTradeStatus(id as string, finalStatus, finalClosedPrice, finalPnl);
        logger.info(
          { id, signal, finalStatus, finalClosedPrice, finalPnl, dealId: deal.id, reason: deal.reason, comment: deal.comment },
          "[Event-Driven Broker Sync] Instantly matched and closed running trade on MT5 deal event!"
        );
        break;
      }
    }
  } catch (err) {
    logger.warn({ err }, "[Trade Tracker] Error handling brokerDealClosed event");
  }
}

/**
 * Handle real-time position removal on MT5 (e.g. SL or TP execution by broker)
 */
async function handleBrokerPositionRemoved({ positionId }: { positionId: string; accountId: string }): Promise<void> {
  try {
    logger.info({ positionId }, "[Event-Driven Broker Sync] Position removed on MT5, triggering immediate trade state audit...");
    await checkRunningTrades();
  } catch (err) {
    logger.warn({ err }, "[Trade Tracker] Error handling brokerPositionRemoved event");
  }
}

/**
 * Evaluate active trades against live price movements in real time
 */
export async function checkRunningTrades(): Promise<void> {
  if (isEvaluating) return;
  isEvaluating = true;

  try {
    const live = getLatestPrice();
    if (!live) {
      return;
    }
    const currentPrice = live.price;
    const currentSpread = live.spread || 0.90;
    const currentBid = live.bid ?? +(currentPrice - currentSpread / 2).toFixed(2);
    const currentAsk = live.ask ?? +(currentPrice + currentSpread / 2).toFixed(2);
    const minStopBuffer = +(Math.max(currentSpread * 1.5, 1.50)).toFixed(2); // XM Safe Buffer

    // Refresh memory cache if stale or empty
    if (cachedRunningTrades.length === 0 || Date.now() - lastDbSyncTime > 15_000) {
      await refreshRunningTradesCache();
    }
    if (cachedRunningTrades.length === 0) return;

    // Fetch open positions and recently closed deals across all active MT5 broker accounts (<1ms from memory)
    const [brokerPositions, recentClosedDeals] = await Promise.all([
      getOpenBrokerPositions().catch(() => [] as BrokerPosition[]),
      getRecentlyClosedBrokerDeals(new Date(Date.now() - 6 * 3600 * 1000)).catch(() => [] as BrokerClosedDeal[])
    ]);

    for (const trade of [...cachedRunningTrades]) {
      const { id, signal, entryPrice, stopLoss, takeProfit, createdAt } = trade;
      const tradeTimestamp = createdAt ? new Date(createdAt).getTime() : 0;

      // ── 1. Match against open broker positions ─────────────────────────────
      // Match by direction and time/price proximity (tolerate up to 15 points spread/slippage)
      const matchingOpenPos = brokerPositions.find(p => {
        if (trade.brokerPositionId && trade.brokerPositionId === p.id) return true;
        const pTime = new Date(p.time).getTime();
        const timeMatch = tradeTimestamp > 0 && pTime >= tradeTimestamp - 30_000 && pTime <= tradeTimestamp + 180_000;
        const priceMatch = Math.abs(p.openPrice - entryPrice) <= 15.0;
        return p.type === signal && (timeMatch || priceMatch);
      });
      
      if (matchingOpenPos) {
        trade.brokerPositionId = matchingOpenPos.id;
      }

      // ── 2. Check if broker already executed the close on MT5 ────────────────
      if (!matchingOpenPos && recentClosedDeals.length > 0) {
        const matchingDeal = recentClosedDeals.find(d => {
          if (trade.brokerPositionId && d.positionId === trade.brokerPositionId) return true;
          const dealTime = new Date(d.time).getTime();
          if (tradeTimestamp > 0 && dealTime < tradeTimestamp - 30_000) return false;
          const isExitType = (signal === "LONG" && d.type === "DEAL_TYPE_SELL") ||
                             (signal === "SHORT" && d.type === "DEAL_TYPE_BUY");
          const comparePrice = d.openPrice || entryPrice;
          const pricePlausible = Math.abs(comparePrice - entryPrice) <= 15.0;
          return isExitType && pricePlausible;
        });

        if (matchingDeal) {
          const isTp = matchingDeal.reason === "DEAL_REASON_TP" ||
                       (matchingDeal.comment && matchingDeal.comment.toLowerCase().includes("tp")) ||
                       (signal === "LONG" && matchingDeal.price >= takeProfit - 0.6) ||
                       (signal === "SHORT" && matchingDeal.price <= takeProfit + 0.6);

          const finalStatus = isTp ? "TARGET_HIT" : "STOP_HIT";
          const finalClosedPrice = matchingDeal.price;
          const netProfit = (matchingDeal.profit || 0) + (matchingDeal.commission || 0) + (matchingDeal.swap || 0);
          const finalPnl = (matchingDeal.profit !== undefined && matchingDeal.profit !== null && matchingDeal.profit !== 0) 
            ? Number(netProfit.toFixed(2)) 
            : Number((signal === "LONG" ? (matchingDeal.price - entryPrice) : (entryPrice - matchingDeal.price)).toFixed(2));

          cachedRunningTrades = cachedRunningTrades.filter(t => t.id !== id);
          await updateTradeStatus(id as string, finalStatus, finalClosedPrice, finalPnl);
          logger.info(
            { id, signal, finalStatus, finalClosedPrice, finalPnl, dealId: matchingDeal.id, comment: matchingDeal.comment },
            "[Broker Sync] Synced trade outcome with real MetaTrader/XM deal execution!"
          );
          continue;
        }
      }

      // ── 3. Active Position & Dynamic Trailing Stop Tracking ────────────────
      const actualEntry = matchingOpenPos?.openPrice || entryPrice;
      let newStatus: string | null = null;
      let closedPrice: number | null = null;
      let pnlPoints: number | null = null;

      if (signal === "LONG") {
        // ── ZERO-LATENCY EXIT FIX ──
        // Real trades (matchingOpenPos) use MetaTrader's native server-side Stop Loss / Take Profit for 0ms latency.
        // We do NOT send delayed API close orders. We only process software exits for Paper Trades.
        if (!matchingOpenPos && currentBid >= takeProfit) {
          newStatus   = "TARGET_HIT";
          closedPrice = takeProfit;
          pnlPoints   = +(takeProfit - actualEntry).toFixed(2);
        } else if (!matchingOpenPos && currentBid <= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = currentBid;
          pnlPoints   = +(closedPrice - actualEntry).toFixed(2);
        } else {
          // Dynamic Trailing Stop Loss
          const distanceToTarget = +(takeProfit - actualEntry).toFixed(2);
          const currentProfit = +(currentPrice - actualEntry).toFixed(2);

          if (distanceToTarget > 0) {
            let targetSl = stopLoss;

            // ── FASTER BREAK-EVEN TO REDUCE DRAWDOWN ──
            // If the trade reaches 1.5 points in profit, immediately lock the Stop Loss at Entry + spread + 0.1
            const breakEvenPrice = +(actualEntry + currentSpread + 0.1).toFixed(2);
            
            // Phase 1: Immediate Break-Even at 1.5 pts profit
            if (currentProfit >= 1.5 && currentProfit < distanceToTarget * 0.6) {
              if (currentBid >= breakEvenPrice + minStopBuffer) {
                targetSl = Math.max(stopLoss, breakEvenPrice);
              }
            }
            // Phase 2: Give TP Room to Breathe. Wait until 60% to TP to lock in wider profits.
            else if (currentProfit >= distanceToTarget * 0.6 && currentProfit < distanceToTarget * 0.8) {
              const p2Target = +(actualEntry + (distanceToTarget * 0.3)).toFixed(2);
              if (currentBid >= p2Target + minStopBuffer) {
                targetSl = Math.max(stopLoss, p2Target);
              } else if (currentBid >= breakEvenPrice + minStopBuffer) {
                targetSl = Math.max(stopLoss, breakEvenPrice);
              }
            }
            // Phase 3: At 80% to TP, lock in 60% of target profit
            else if (currentProfit >= distanceToTarget * 0.8) {
              const p3Target = +(actualEntry + (distanceToTarget * 0.6)).toFixed(2);
              if (currentBid >= p3Target + minStopBuffer) {
                targetSl = Math.max(stopLoss, p3Target);
              } else {
                const p2Target = +(actualEntry + (distanceToTarget * 0.3)).toFixed(2);
                if (currentBid >= p2Target + minStopBuffer) {
                  targetSl = Math.max(stopLoss, p2Target);
                }
              }
            }

            const maxAllowedSl = +(currentBid - minStopBuffer).toFixed(2);
            if (targetSl > stopLoss && targetSl <= maxAllowedSl) {
              if (matchingOpenPos) {
                if (!trailingSLInFlight.has(id as string)) {
                  trailingSLInFlight.add(id as string);
                  modifyOpenPositionsStopLoss("LONG", targetSl).then(async (modResult) => {
                    if (modResult && modResult.success && modResult.modifiedCount > 0) {
                      const actualSavedSl = modResult.calibratedSL || targetSl;
                      trade.stopLoss = actualSavedSl;
                      await updateTradeStopLoss(id as string, actualSavedSl);
                      logger.info(
                        { id, signal, entryPrice: actualEntry, currentPrice, currentBid, oldSl: stopLoss, newSl: actualSavedSl, distanceToTarget, currentProfit },
                        "[Event-Driven Trailing SL] Successfully updated stop loss on MT5 and DB"
                      );
                    } else {
                      logger.debug(
                        { id, signal, targetSl, reason: modResult?.reason },
                        "[Event-Driven Trailing SL] MT5 stop modification deferred, will retry next tick"
                      );
                    }
                  }).finally(() => trailingSLInFlight.delete(id as string));
                }
              } else {
                trade.stopLoss = targetSl;
                await updateTradeStopLoss(id as string, targetSl);
                logger.info(
                  { id, signal, entryPrice: actualEntry, currentPrice, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                  "[Event-Driven Trailing SL] Updated stop loss in DB (paper trade)"
                );
              }
            }
          }
        }
      } else if (signal === "SHORT") {
        // ── ZERO-LATENCY EXIT FIX ──
        if (!matchingOpenPos && currentAsk <= takeProfit) {
          newStatus   = "TARGET_HIT";
          closedPrice = takeProfit;
          pnlPoints   = +(actualEntry - takeProfit).toFixed(2);
        } else if (!matchingOpenPos && currentAsk >= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = currentAsk;
          pnlPoints   = +(actualEntry - closedPrice).toFixed(2);
        } else {
          // Dynamic Trailing Stop Loss
          const distanceToTarget = +(actualEntry - takeProfit).toFixed(2);
          const currentProfit = +(actualEntry - currentPrice).toFixed(2);

          if (distanceToTarget > 0) {
            let targetSl = stopLoss;

            // ── FASTER BREAK-EVEN TO REDUCE DRAWDOWN ──
            // If the trade reaches 1.5 points in profit, immediately lock the Stop Loss at Entry - spread - 0.1
            const breakEvenPrice = +(actualEntry - currentSpread - 0.1).toFixed(2);
            
            // Phase 1: Immediate Break-Even at 1.5 pts profit
            if (currentProfit >= 1.5 && currentProfit < distanceToTarget * 0.6) {
              if (currentAsk <= breakEvenPrice - minStopBuffer) {
                targetSl = Math.min(stopLoss, breakEvenPrice);
              }
            }
            // Phase 2: Give TP Room to Breathe. Wait until 60% to TP to lock in wider profits.
            else if (currentProfit >= distanceToTarget * 0.6 && currentProfit < distanceToTarget * 0.8) {
              const p2Target = +(actualEntry - (distanceToTarget * 0.3)).toFixed(2);
              if (currentAsk <= p2Target - minStopBuffer) {
                targetSl = Math.min(stopLoss, p2Target);
              } else if (currentAsk <= breakEvenPrice - minStopBuffer) {
                targetSl = Math.min(stopLoss, breakEvenPrice);
              }
            }
            // Phase 3: At 80% to TP, lock in 60% of target profit
            else if (currentProfit >= distanceToTarget * 0.8) {
              const p3Target = +(actualEntry - (distanceToTarget * 0.6)).toFixed(2);
              if (currentAsk <= p3Target - minStopBuffer) {
                targetSl = Math.min(stopLoss, p3Target);
              } else {
                const p2Target = +(actualEntry - (distanceToTarget * 0.3)).toFixed(2);
                if (currentAsk <= p2Target - minStopBuffer) {
                  targetSl = Math.min(stopLoss, p2Target);
                }
              }
            }

            const minAllowedSl = +(currentAsk + minStopBuffer).toFixed(2);
            if (targetSl < stopLoss && targetSl >= minAllowedSl) {
              if (matchingOpenPos) {
                if (!trailingSLInFlight.has(id as string)) {
                  trailingSLInFlight.add(id as string);
                  modifyOpenPositionsStopLoss("SHORT", targetSl).then(async (modResult) => {
                    if (modResult && modResult.success && modResult.modifiedCount > 0) {
                      const actualSavedSl = modResult.calibratedSL || targetSl;
                      trade.stopLoss = actualSavedSl;
                      await updateTradeStopLoss(id as string, actualSavedSl);
                      logger.info(
                        { id, signal, entryPrice: actualEntry, currentPrice, currentAsk, oldSl: stopLoss, newSl: actualSavedSl, distanceToTarget, currentProfit },
                        "[Event-Driven Trailing SL] Successfully updated stop loss on MT5 and DB"
                      );
                    } else {
                      logger.debug(
                        { id, signal, targetSl, reason: modResult?.reason },
                        "[Event-Driven Trailing SL] MT5 stop modification deferred, will retry next tick"
                      );
                    }
                  }).finally(() => trailingSLInFlight.delete(id as string));
                }
              } else {
                trade.stopLoss = targetSl;
                await updateTradeStopLoss(id as string, targetSl);
                logger.info(
                  { id, signal, entryPrice: actualEntry, currentPrice, oldSl: stopLoss, newSl: targetSl, distanceToTarget, currentProfit },
                  "[Event-Driven Trailing SL] Updated stop loss in DB (paper trade)"
                );
              }
            }
          }
        }
      }

      if (newStatus && closedPrice !== null && pnlPoints !== null) {
        cachedRunningTrades = cachedRunningTrades.filter(t => t.id !== id);
        await updateTradeStatus(id as string, newStatus, closedPrice, pnlPoints);
        logger.info({ id, signal, newStatus, closedPrice, pnlPoints }, "[Trade Tracker] Trade outcome updated");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Trade tracker update error");
  } finally {
    isEvaluating = false;
  }
}

/**
 * Event listener triggered on live streaming price tick
 * Throttled to 300ms, or triggered immediately if price approaches stop or target
 */
function handleLiveTickForTradeTracker(live: LivePrice): void {
  if (cachedRunningTrades.length === 0) return;

  const now = Date.now();
  const timeSinceLast = now - lastTickCheckTime;
  const priceDelta = Math.abs(live.price - lastEvaluatedTickPrice);

  // Check if price is within 0.50 points of any trade's TP or SL
  let isNearBoundary = false;
  for (const t of cachedRunningTrades) {
    if (Math.abs(live.price - t.takeProfit) <= 0.60 || Math.abs(live.price - t.stopLoss) <= 0.60) {
      isNearBoundary = true;
      break;
    }
  }

  // Trigger evaluation if:
  // 1. Price is near SL/TP boundary (instant trigger: >=100ms)
  // 2. Or price moved by at least 15 cents and 300ms elapsed
  // 3. Or 1.5s elapsed since last check
  if ((isNearBoundary && timeSinceLast >= 100) ||
      (priceDelta >= 0.15 && timeSinceLast >= 300) ||
      timeSinceLast >= 1500) {
    lastTickCheckTime = now;
    lastEvaluatedTickPrice = live.price;
    checkRunningTrades().catch(() => {});
  }
}

export function startTradeTracker() {
  logger.info("Event-driven trade tracker started with real-time MetaApi deal & position streaming");

  // Initial load
  refreshRunningTradesCache().catch(() => {});

  // Subscribe to real-time broker streaming events
  brokerEvents.on("dealClosed", handleBrokerDealClosed);
  brokerEvents.on("positionRemoved", handleBrokerPositionRemoved);
  priceEmitter.on("price", handleLiveTickForTradeTracker);

  // Background audit interval for fail-safe reconciliation
  const intervalId = setInterval(checkRunningTrades, AUDIT_INTERVAL);
  if (typeof intervalId === "object" && "unref" in intervalId) (intervalId as any).unref();
}
