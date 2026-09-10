import { getRunningTrades, updateTradeStatus, updateTradeStopLoss, updateTradeStopLossAndTakeProfit } from "@workspace/db";
import { getLatestPrice, priceEmitter, type LivePrice } from "./priceEvents.js";
import { logger } from "./logger.js";
import {
  modifyOpenPositionsStopLoss,
  modifyOpenPositionsStopLossAndTakeProfit,
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

export interface ActiveTradeTrackerState {
  initialTakeProfit: number;
  initialStopLoss: number;
  peakFavorablePrice: number;
  peakProfitPoints: number;
  runnerActivated: boolean;
  extendedTakeProfit: number;
  lastTargetSl: number;
  trailStage: "PROTECTIVE" | "BREAK_EVEN" | "RUNNER_STAGE_1" | "RUNNER_STAGE_2" | "RUNNER_STAGE_3";
}

export const activeTradeStates = new Map<string, ActiveTradeTrackerState>();

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
        activeTradeStates.delete(id as string);
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
    const minStopBuffer = +(Math.max(currentSpread * 1.2, 0.40)).toFixed(2); // Match metaApiFeed's dynamic buffer

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
        
        // ── ZERO-LATENCY ALIGNMENT: Sync Stop Loss from Broker to DB ──
        if (matchingOpenPos.stopLoss > 0 && Math.abs(matchingOpenPos.stopLoss - stopLoss) > 0.05) {
          logger.warn(
            { id, dbSL: stopLoss, brokerSL: matchingOpenPos.stopLoss },
            "[Sync] Broker stop loss differs from DB. Syncing DB to match broker truth."
          );
          trade.stopLoss = matchingOpenPos.stopLoss;
          // Update DB (fire and forget to not block loop)
          updateTradeStopLoss(id as string, matchingOpenPos.stopLoss).catch(e => 
            logger.error({err: e}, "Failed to sync broker SL to DB")
          );
        }
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

          activeTradeStates.delete(id as string);
          cachedRunningTrades = cachedRunningTrades.filter(t => t.id !== id);
          await updateTradeStatus(id as string, finalStatus, finalClosedPrice, finalPnl);
          logger.info(
            { id, signal, finalStatus, finalClosedPrice, finalPnl, dealId: matchingDeal.id, comment: matchingDeal.comment },
            "[Broker Sync] Synced trade outcome with real MetaTrader/XM deal execution!"
          );
          continue;
        }
      }

      // ── 3. Active Position & Asymmetric Runner Trailing Stop Tracking ──────
      const actualEntry = matchingOpenPos?.openPrice || entryPrice;
      let newStatus: string | null = null;
      let closedPrice: number | null = null;
      let pnlPoints: number | null = null;

      // Retrieve or initialize per-trade tracking state
      let trackerState = activeTradeStates.get(id as string);
      if (!trackerState) {
        trackerState = {
          initialTakeProfit: takeProfit,
          initialStopLoss: stopLoss,
          peakFavorablePrice: actualEntry,
          peakProfitPoints: 0,
          runnerActivated: false,
          extendedTakeProfit: takeProfit,
          lastTargetSl: stopLoss,
          trailStage: "PROTECTIVE"
        };
        activeTradeStates.set(id as string, trackerState);
      }

      if (signal === "LONG") {
        const distanceToInitialTarget = Math.max(0.5, +(trackerState.initialTakeProfit - actualEntry).toFixed(2));
        const currentProfit = +(currentPrice - actualEntry).toFixed(2);

        // Update maximum favorable excursion / peak
        if (currentPrice > trackerState.peakFavorablePrice) {
          trackerState.peakFavorablePrice = currentPrice;
        }
        const peakProfit = +(trackerState.peakFavorablePrice - actualEntry).toFixed(2);
        trackerState.peakProfitPoints = Math.max(trackerState.peakProfitPoints, peakProfit);

        // ── RUNNER ACTIVATION (Let Runners Run) ──
        // When trade reaches ~85% of initial target or approaches within 0.30 of TP:
        // Automatically expand Take Profit (+25 pts) so MT5 doesn't close it prematurely!
        if (!trackerState.runnerActivated && (currentProfit >= distanceToInitialTarget * 0.85 || currentBid >= trackerState.initialTakeProfit - 0.30)) {
          trackerState.runnerActivated = true;
          const runnerExtension = Math.max(distanceToInitialTarget * 4.0, 25.0);
          trackerState.extendedTakeProfit = +(actualEntry + runnerExtension).toFixed(2);
          trade.takeProfit = trackerState.extendedTakeProfit;
          logger.info(
            { id, signal, actualEntry, initialTp: trackerState.initialTakeProfit, extendedTp: trackerState.extendedTakeProfit, currentProfit },
            "🚀 [ASYMMETRIC RUNNER ACTIVATED] Trade unlocked Runner Mode! Take Profit dynamically expanded to let runners pay for small losses."
          );
        }

        // ── EXIT EVALUATION FOR PAPER TRADES (Real trades exit via MT5 native SL/TP) ──
        if (!matchingOpenPos && currentBid <= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = currentBid;
          pnlPoints   = +(closedPrice - actualEntry).toFixed(2);
          activeTradeStates.delete(id as string);
        } else if (!matchingOpenPos && currentBid >= trade.takeProfit) {
          if (!trackerState.runnerActivated) {
            trackerState.runnerActivated = true;
            const runnerExtension = Math.max(distanceToInitialTarget * 4.0, 25.0);
            trackerState.extendedTakeProfit = +(actualEntry + runnerExtension).toFixed(2);
            trade.takeProfit = trackerState.extendedTakeProfit;
            logger.info({ id, signal, newTp: trade.takeProfit }, "🚀 [ASYMMETRIC RUNNER ACTIVATED] Extended TP on target touch!");
          } else {
            newStatus   = "TARGET_HIT";
            closedPrice = trade.takeProfit;
            pnlPoints   = +(trade.takeProfit - actualEntry).toFixed(2);
            activeTradeStates.delete(id as string);
          }
        } else {
          // ── ASYMMETRIC TRAILING STOP CALCULATION ──
          let targetSl = stopLoss;
          // Break-even price covers spread plus small buffer (+0.20 pts)
          const breakEvenPrice = +(actualEntry + currentSpread + 0.20).toFixed(2);

          // Step A: Capital Protection / Break-Even
          // Trigger when profit reaches >= 2.20 pts (or 40% of target distance)
          const beTriggerProfit = Math.max(2.20, +(distanceToInitialTarget * 0.40).toFixed(2));
          if (currentProfit >= beTriggerProfit) {
            // Require current bid to be safely above BE price (+0.60 pts room)
            if (currentBid >= breakEvenPrice + minStopBuffer + 0.60) {
              targetSl = Math.max(targetSl, breakEvenPrice);
              if (trackerState.trailStage === "PROTECTIVE") trackerState.trailStage = "BREAK_EVEN";
            }
          }

          // Step B: Asymmetric Trailing Logic
          if (trackerState.runnerActivated) {
            // Floor guaranteed profit: lock at least +2.00 or 50% of initial target
            const minLockedProfit = Math.max(2.00, +(distanceToInitialTarget * 0.50).toFixed(2));
            const floorProfitPrice = +(actualEntry + minLockedProfit).toFixed(2);
            targetSl = Math.max(targetSl, floorProfitPrice);

            // Progressive Asymmetric Tiers (with ample breathing space for Gold swings)
            if (peakProfit >= 4.0 && peakProfit < 7.0) {
              // Tier 1 Runner (+4 to +7 pts): Trail 2.4 pts behind peak price
              const tier1Sl = +(trackerState.peakFavorablePrice - 2.40).toFixed(2);
              targetSl = Math.max(targetSl, tier1Sl);
              trackerState.trailStage = "RUNNER_STAGE_1";
            } else if (peakProfit >= 7.0 && peakProfit < 12.0) {
              // Tier 2 Strong Runner (+7 to +12 pts): Trail 2.8 pts behind peak price
              const tier2Sl = +(trackerState.peakFavorablePrice - 2.80).toFixed(2);
              targetSl = Math.max(targetSl, tier2Sl);
              trackerState.trailStage = "RUNNER_STAGE_2";
            } else if (peakProfit >= 12.0) {
              // Tier 3 Mega Runner (> +12 pts): Trail 3.5 pts behind peak price
              const tier3Sl = +(trackerState.peakFavorablePrice - 3.50).toFixed(2);
              targetSl = Math.max(targetSl, tier3Sl);
              trackerState.trailStage = "RUNNER_STAGE_3";
            }
          } else {
            // Pre-runner progressive locking (activates once >= 55% of target)
            if (currentProfit >= distanceToInitialTarget * 0.55 && currentProfit < distanceToInitialTarget * 0.85) {
              const p2Target = +(actualEntry + (distanceToInitialTarget * 0.30)).toFixed(2);
              if (currentBid >= p2Target + minStopBuffer + 0.80) {
                targetSl = Math.max(targetSl, p2Target);
              } else if (currentBid >= breakEvenPrice + minStopBuffer + 0.60) {
                targetSl = Math.max(targetSl, breakEvenPrice);
              }
            }
          }

          // Step C: Time Decay Protection (Swing Trades: Allow 45 minutes of development)
          const tradeDurationMins = (Date.now() - (trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now())) / 60000;
          if (!trackerState.runnerActivated && tradeDurationMins >= 45 && currentProfit >= 1.50) {
            const bailoutSl = +(currentBid - Math.max(minStopBuffer * 2.0, 1.20)).toFixed(2);
            targetSl = Math.max(targetSl, Math.min(bailoutSl, breakEvenPrice));
          }

          // Step D: Dispatch Updates to MT5 Broker and Database
          const maxAllowedSl = +(currentBid - minStopBuffer).toFixed(2);
          const shouldUpdateBrokerSl = targetSl > stopLoss && targetSl <= maxAllowedSl;
          const shouldUpdateBrokerTp = trackerState.runnerActivated && Math.abs(trade.takeProfit - trackerState.extendedTakeProfit) < 0.05 && trade.takeProfit > trackerState.initialTakeProfit;

          if ((shouldUpdateBrokerSl || shouldUpdateBrokerTp) && targetSl <= maxAllowedSl) {
            if (matchingOpenPos) {
              if (!trailingSLInFlight.has(id as string)) {
                trailingSLInFlight.add(id as string);
                const newSlToSend = Math.max(stopLoss, targetSl);
                const newTpToSend = trackerState.runnerActivated ? trackerState.extendedTakeProfit : matchingOpenPos.takeProfit;

                modifyOpenPositionsStopLossAndTakeProfit("LONG", newSlToSend, newTpToSend).then(async (modResult) => {
                  if (modResult && modResult.success && modResult.modifiedCount > 0) {
                    const actualSavedSl = modResult.calibratedSL || newSlToSend;
                    trade.stopLoss = actualSavedSl;
                    if (modResult.calibratedTP) trade.takeProfit = modResult.calibratedTP;
                    trackerState!.lastTargetSl = actualSavedSl;

                    await updateTradeStopLossAndTakeProfit(id as string, actualSavedSl, trade.takeProfit);
                    logger.info(
                      { 
                        id, signal, entryPrice: actualEntry, currentPrice, currentBid, 
                        oldSl: stopLoss, newSl: actualSavedSl, newTp: trade.takeProfit, 
                        peakProfit, currentProfit, stage: trackerState!.trailStage 
                      },
                      "[Asymmetric Trailing SL] Successfully updated Runner SL/TP on MT5 and DB"
                    );
                  } else {
                    logger.debug(
                      { id, signal, targetSl, reason: modResult?.reason },
                      "[Asymmetric Trailing SL] MT5 stop modification deferred, will retry next tick"
                    );
                  }
                }).finally(() => trailingSLInFlight.delete(id as string));
              }
            } else {
              trade.stopLoss = targetSl;
              trackerState.lastTargetSl = targetSl;
              await updateTradeStopLossAndTakeProfit(id as string, targetSl, trade.takeProfit);
              logger.info(
                { 
                  id, signal, entryPrice: actualEntry, currentPrice, oldSl: stopLoss, 
                  newSl: targetSl, newTp: trade.takeProfit, peakProfit, currentProfit, 
                  stage: trackerState.trailStage 
                },
                "[Asymmetric Trailing SL] Updated Runner SL/TP in DB (paper trade)"
              );
            }
          }
        }
      } else if (signal === "SHORT") {
        const distanceToInitialTarget = Math.max(0.5, +(actualEntry - trackerState.initialTakeProfit).toFixed(2));
        const currentProfit = +(actualEntry - currentPrice).toFixed(2);

        // Update maximum favorable excursion / peak for SHORT (price moves down)
        if (currentPrice < trackerState.peakFavorablePrice) {
          trackerState.peakFavorablePrice = currentPrice;
        }
        const peakProfit = +(actualEntry - trackerState.peakFavorablePrice).toFixed(2);
        trackerState.peakProfitPoints = Math.max(trackerState.peakProfitPoints, peakProfit);

        // ── RUNNER ACTIVATION (Let Runners Run) ──
        if (!trackerState.runnerActivated && (currentProfit >= distanceToInitialTarget * 0.85 || currentAsk <= trackerState.initialTakeProfit + 0.30)) {
          trackerState.runnerActivated = true;
          const runnerExtension = Math.max(distanceToInitialTarget * 4.0, 25.0);
          trackerState.extendedTakeProfit = +(actualEntry - runnerExtension).toFixed(2);
          trade.takeProfit = trackerState.extendedTakeProfit;
          logger.info(
            { id, signal, actualEntry, initialTp: trackerState.initialTakeProfit, extendedTp: trackerState.extendedTakeProfit, currentProfit },
            "🚀 [ASYMMETRIC RUNNER ACTIVATED] Trade unlocked Runner Mode! Take Profit dynamically expanded to let runners pay for small losses."
          );
        }

        // ── EXIT EVALUATION FOR PAPER TRADES ──
        if (!matchingOpenPos && currentAsk >= stopLoss) {
          newStatus   = "STOP_HIT";
          closedPrice = currentAsk;
          pnlPoints   = +(actualEntry - closedPrice).toFixed(2);
          activeTradeStates.delete(id as string);
        } else if (!matchingOpenPos && currentAsk <= trade.takeProfit) {
          if (!trackerState.runnerActivated) {
            trackerState.runnerActivated = true;
            const runnerExtension = Math.max(distanceToInitialTarget * 4.0, 25.0);
            trackerState.extendedTakeProfit = +(actualEntry - runnerExtension).toFixed(2);
            trade.takeProfit = trackerState.extendedTakeProfit;
            logger.info({ id, signal, newTp: trade.takeProfit }, "🚀 [ASYMMETRIC RUNNER ACTIVATED] Extended TP on target touch!");
          } else {
            newStatus   = "TARGET_HIT";
            closedPrice = trade.takeProfit;
            pnlPoints   = +(actualEntry - trade.takeProfit).toFixed(2);
            activeTradeStates.delete(id as string);
          }
        } else {
          // ── ASYMMETRIC TRAILING STOP CALCULATION ──
          let targetSl = stopLoss;
          // Break-even price covers spread plus small buffer (+0.20 pts)
          const breakEvenPrice = +(actualEntry - currentSpread - 0.20).toFixed(2);

          // Step A: Capital Protection / Break-Even
          // Trigger when profit reaches >= 2.20 pts (or 40% of target distance)
          const beTriggerProfit = Math.max(2.20, +(distanceToInitialTarget * 0.40).toFixed(2));
          if (currentProfit >= beTriggerProfit) {
            // Require current ask to be safely below BE price (+0.60 pts room)
            if (currentAsk <= breakEvenPrice - minStopBuffer - 0.60) {
              targetSl = Math.min(targetSl, breakEvenPrice);
              if (trackerState.trailStage === "PROTECTIVE") trackerState.trailStage = "BREAK_EVEN";
            }
          }

          // Step B: Asymmetric Trailing Logic
          if (trackerState.runnerActivated) {
            // Floor guaranteed profit: lock at least +2.00 or 50% of initial target
            const minLockedProfit = Math.max(2.00, +(distanceToInitialTarget * 0.50).toFixed(2));
            const floorProfitPrice = +(actualEntry - minLockedProfit).toFixed(2);
            targetSl = Math.min(targetSl, floorProfitPrice);

            // Progressive Asymmetric Tiers (with ample breathing space for Gold swings)
            if (peakProfit >= 4.0 && peakProfit < 7.0) {
              // Tier 1 Runner (+4 to +7 pts): Trail 2.4 pts behind peak price
              const tier1Sl = +(trackerState.peakFavorablePrice + 2.40).toFixed(2);
              targetSl = Math.min(targetSl, tier1Sl);
              trackerState.trailStage = "RUNNER_STAGE_1";
            } else if (peakProfit >= 7.0 && peakProfit < 12.0) {
              // Tier 2 Strong Runner (+7 to +12 pts): Trail 2.8 pts behind peak price
              const tier2Sl = +(trackerState.peakFavorablePrice + 2.80).toFixed(2);
              targetSl = Math.min(targetSl, tier2Sl);
              trackerState.trailStage = "RUNNER_STAGE_2";
            } else if (peakProfit >= 12.0) {
              // Tier 3 Mega Runner (> +12 pts): Trail 3.5 pts behind peak price
              const tier3Sl = +(trackerState.peakFavorablePrice + 3.50).toFixed(2);
              targetSl = Math.min(targetSl, tier3Sl);
              trackerState.trailStage = "RUNNER_STAGE_3";
            }
          } else {
            // Pre-runner progressive locking (activates once >= 55% of target)
            if (currentProfit >= distanceToInitialTarget * 0.55 && currentProfit < distanceToInitialTarget * 0.85) {
              const p2Target = +(actualEntry - (distanceToInitialTarget * 0.30)).toFixed(2);
              if (currentAsk <= p2Target - minStopBuffer - 0.80) {
                targetSl = Math.min(targetSl, p2Target);
              } else if (currentAsk <= breakEvenPrice - minStopBuffer - 0.60) {
                targetSl = Math.min(targetSl, breakEvenPrice);
              }
            }
          }

          // Step C: Time Decay Protection (Swing Trades: Allow 45 minutes of development)
          const tradeDurationMins = (Date.now() - (trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now())) / 60000;
          if (!trackerState.runnerActivated && tradeDurationMins >= 45 && currentProfit >= 1.50) {
            const bailoutSl = +(currentAsk + Math.max(minStopBuffer * 2.0, 1.20)).toFixed(2);
            targetSl = Math.min(targetSl, Math.max(bailoutSl, breakEvenPrice));
          }

          // Step D: Dispatch Updates to MT5 Broker and Database
          const minAllowedSl = +(currentAsk + minStopBuffer).toFixed(2);
          const shouldUpdateBrokerSl = targetSl < stopLoss && targetSl >= minAllowedSl;
          const shouldUpdateBrokerTp = trackerState.runnerActivated && Math.abs(trade.takeProfit - trackerState.extendedTakeProfit) < 0.05 && trade.takeProfit < trackerState.initialTakeProfit;

          if ((shouldUpdateBrokerSl || shouldUpdateBrokerTp) && targetSl >= minAllowedSl) {
            if (matchingOpenPos) {
              if (!trailingSLInFlight.has(id as string)) {
                trailingSLInFlight.add(id as string);
                const newSlToSend = Math.min(stopLoss, targetSl);
                const newTpToSend = trackerState.runnerActivated ? trackerState.extendedTakeProfit : matchingOpenPos.takeProfit;

                modifyOpenPositionsStopLossAndTakeProfit("SHORT", newSlToSend, newTpToSend).then(async (modResult) => {
                  if (modResult && modResult.success && modResult.modifiedCount > 0) {
                    const actualSavedSl = modResult.calibratedSL || newSlToSend;
                    trade.stopLoss = actualSavedSl;
                    if (modResult.calibratedTP) trade.takeProfit = modResult.calibratedTP;
                    trackerState!.lastTargetSl = actualSavedSl;

                    await updateTradeStopLossAndTakeProfit(id as string, actualSavedSl, trade.takeProfit);
                    logger.info(
                      { 
                        id, signal, entryPrice: actualEntry, currentPrice, currentAsk, 
                        oldSl: stopLoss, newSl: actualSavedSl, newTp: trade.takeProfit, 
                        peakProfit, currentProfit, stage: trackerState!.trailStage 
                      },
                      "[Asymmetric Trailing SL] Successfully updated Runner SL/TP on MT5 and DB"
                    );
                  } else {
                    logger.debug(
                      { id, signal, targetSl, reason: modResult?.reason },
                      "[Asymmetric Trailing SL] MT5 stop modification deferred, will retry next tick"
                    );
                  }
                }).finally(() => trailingSLInFlight.delete(id as string));
              }
            } else {
              trade.stopLoss = targetSl;
              trackerState.lastTargetSl = targetSl;
              await updateTradeStopLossAndTakeProfit(id as string, targetSl, trade.takeProfit);
              logger.info(
                { 
                  id, signal, entryPrice: actualEntry, currentPrice, oldSl: stopLoss, 
                  newSl: targetSl, newTp: trade.takeProfit, peakProfit, currentProfit, 
                  stage: trackerState.trailStage 
                },
                "[Asymmetric Trailing SL] Updated Runner SL/TP in DB (paper trade)"
              );
            }
          }
        }
      }

      if (newStatus && closedPrice !== null && pnlPoints !== null) {
        activeTradeStates.delete(id as string);
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
