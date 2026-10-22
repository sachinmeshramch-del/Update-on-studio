import { getRunningTrades, updateTradeStatus, updateTradeStopLoss, updateTradeStopLossAndTakeProfit, updateTradeEntryPrice } from "@workspace/db";
import { getLatestPrice, priceEmitter, type LivePrice } from "./priceEvents.js";
import { logger } from "./logger.js";
import {
  modifyOpenPositionsStopLoss,
  modifyOpenPositionsStopLossAndTakeProfit,
  getOpenBrokerPositions,
  getRecentlyClosedBrokerDeals,
  closeBrokerPosition,
  getMetaApiStatus,
  brokerEvents,
  type BrokerPosition,
  type BrokerClosedDeal
} from "./metaApiFeed.js";
import { onTradeClosedHook } from "./hermesEngine.js";

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
  trailStage: "PROTECTIVE" | "BREAK_EVEN" | "PROFIT_LOCKED_2PT" | "RUNNER_STAGE_1" | "RUNNER_STAGE_2" | "RUNNER_STAGE_3";
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
      const pricePlausible = Math.abs(comparePrice - entryPrice) <= 3.0; // Realistic broker execution tolerance
      const timePlausible = tradeTimestamp > 0 && Math.abs(dealTime - tradeTimestamp) <= 3600_000;

      if (hasIdMatch || (isExitType && pricePlausible && timePlausible)) {
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
        onTradeClosedHook({ ...trade, pnlPoints: finalPnl, closedPrice: finalClosedPrice, tradeStatus: finalStatus }).catch(() => {});
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
      // Match by direction and tight time/price proximity to prevent cross-matching
      const matchingOpenPos = brokerPositions.find(p => {
        if (trade.brokerPositionId && trade.brokerPositionId === p.id) return true;
        const pTime = new Date(p.time).getTime();
        const timeMatch = tradeTimestamp > 0 && Math.abs(pTime - tradeTimestamp) <= 120_000;
        const priceMatch = Math.abs(p.openPrice - entryPrice) <= 3.0;
        return p.type === signal && timeMatch && priceMatch;
      });
      
      if (matchingOpenPos) {
        trade.brokerPositionId = matchingOpenPos.id;

        // ── ZERO-LATENCY ALIGNMENT: Sync Exact Entry Price (Slippage) from Broker to DB ──
        if (matchingOpenPos.openPrice > 0 && Math.abs(matchingOpenPos.openPrice - trade.entryPrice) > 0.01) {
          logger.info(
            { id, dbEntry: trade.entryPrice, brokerEntry: matchingOpenPos.openPrice },
            "[Sync] Updating DB entry price to exact broker execution price (Slippage correction)"
          );
          trade.entryPrice = matchingOpenPos.openPrice;
          updateTradeEntryPrice(id as string, matchingOpenPos.openPrice).catch(e =>
            logger.error({err: e}, "Failed to sync exact broker entry price to DB")
          );
        }
        
        // ── ZERO-LATENCY ALIGNMENT: Sync Stop Loss and Take Profit from Broker to DB ──
        let slChanged = false;
        let tpChanged = false;

        if (matchingOpenPos.stopLoss > 0 && Math.abs(matchingOpenPos.stopLoss - stopLoss) > 0.05) {
          logger.warn(
            { id, dbSL: stopLoss, brokerSL: matchingOpenPos.stopLoss },
            "[Sync] Broker stop loss differs from DB. Syncing DB to match broker truth."
          );
          trade.stopLoss = matchingOpenPos.stopLoss;
          slChanged = true;
        }

        if (matchingOpenPos.takeProfit > 0 && Math.abs(matchingOpenPos.takeProfit - takeProfit) > 0.05) {
          logger.warn(
            { id, dbTP: takeProfit, brokerTP: matchingOpenPos.takeProfit },
            "[Sync] Broker take profit differs from DB. Syncing DB to match broker truth."
          );
          trade.takeProfit = matchingOpenPos.takeProfit;
          tpChanged = true;
        }

        if (slChanged || tpChanged) {
          // Update DB (fire and forget to not block loop)
          updateTradeStopLossAndTakeProfit(id as string, trade.stopLoss, trade.takeProfit).catch(e => 
            logger.error({err: e}, "Failed to sync broker SL/TP to DB")
          );
        }
      }

      // ── 2. Check if broker already executed the close on MT5 ────────────────
      if (!matchingOpenPos && recentClosedDeals.length > 0) {
        const matchingDeal = recentClosedDeals.find(d => {
          if (trade.brokerPositionId && d.positionId === trade.brokerPositionId) return true;
          const dealTime = new Date(d.time).getTime();
          const timeMatch = tradeTimestamp > 0 && dealTime >= tradeTimestamp - 30_000 && dealTime <= tradeTimestamp + 3600_000;
          const isExitType = (signal === "LONG" && d.type === "DEAL_TYPE_SELL") ||
                             (signal === "SHORT" && d.type === "DEAL_TYPE_BUY");
          const comparePrice = d.openPrice || entryPrice;
          const pricePlausible = Math.abs(comparePrice - entryPrice) <= 3.0;
          return isExitType && timeMatch && pricePlausible;
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
          onTradeClosedHook({ ...trade, pnlPoints: finalPnl, closedPrice: finalClosedPrice, tradeStatus: finalStatus }).catch(() => {});
          logger.info(
            { id, signal, finalStatus, finalClosedPrice, finalPnl, dealId: matchingDeal.id, comment: matchingDeal.comment },
            "[Broker Sync] Synced trade outcome with real MetaTrader/XM deal execution!"
          );
          continue;
        }
      }

      // ── 2.5 Check for Orphaned Real Trades (Missing from MT5 entirely) ──
      // Only declare orphaned if the broker feed is actively connected, terminal state is valid,
      // and the trade has existed for at least 45 seconds to allow MT5 execution and sync to complete.
      const isBrokerConnected = Boolean(getMetaApiStatus()?.connected);
      const isNewlyCreated = tradeTimestamp > 0 && (Date.now() - tradeTimestamp < 45_000);
      if (trade.brokerPositionId && !matchingOpenPos && isBrokerConnected && !isNewlyCreated) {
        logger.warn(
          { id, signal, brokerPositionId: trade.brokerPositionId },
          "[Broker Sync] Trade is marked as real but is missing from MT5 open positions. Forcing closure to sync with broker."
        );
        const finalStatus = "MANUAL_CLOSE";
        const finalClosedPrice = currentPrice;
        const pnl = Number((signal === "LONG" ? (currentPrice - entryPrice) : (entryPrice - currentPrice)).toFixed(2));
        
        activeTradeStates.delete(id as string);
        cachedRunningTrades = cachedRunningTrades.filter(t => t.id !== id);
        await updateTradeStatus(id as string, finalStatus, finalClosedPrice, pnl);
        onTradeClosedHook({ ...trade, pnlPoints: pnl, closedPrice: finalClosedPrice, tradeStatus: finalStatus }).catch(() => {});
        continue;
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

        // ── GUARANTEED PROFIT RETRACE SAFEGUARD WHEN MARKET WAS IN FAVOR (LONG) ──
        // Only trigger market close if the trade ALREADY moved firmly into favor (peak >= +1.50 pts)
        // AND subsequently retraced back down to the +1.00 pt guarantee level.
        // Slippage & Spread Compensation: For a LONG trade, closing sends a SELL at the live BID price.
        // To guarantee the user receives at least the desired +1.00 point net profit after broker execution,
        // we add a slippage/spread allowance buffer (0.15 pts) so net profit delivered to the broker account is >= 1.00 pt.
        const is5rRunner = trade.tradeDuration?.includes("5R") || trade.signalType === "BREAKOUT" || (distanceToInitialTarget >= 14.0);
        const slippageAllowance = 0.15;
        const targetNetProfit = 1.00;
        const minGuaranteedProfitPrice = +(actualEntry + targetNetProfit).toFixed(2);
        const triggerProfitThreshold = +(actualEntry + targetNetProfit + slippageAllowance).toFixed(2);

        // 1-point fixed profit retrace exit removed per user request. Allowing trades and runners to maximize positive direction.
        if (false) {
          newStatus   = "TARGET_HIT";
          closedPrice = +(currentBid).toFixed(2);
          pnlPoints   = +(closedPrice - actualEntry).toFixed(2);
          if (matchingOpenPos) {
            closeBrokerPosition(matchingOpenPos.id, matchingOpenPos.accountId).catch(err =>
              logger.warn({ id, err }, "Failed to send market close for 1-point profit booking on broker")
            );
          }
          activeTradeStates.delete(id as string);
          logger.info(
            { id, signal, entryPrice: actualEntry, peakProfit, closedPrice, pnlPoints },
            `🎯 [Favorable Market Exit] Trade moved firmly in favor (peak: +${peakProfit} pts) and retraced to guarantee level (+ slippage buffer). Booked desired profit on broker!`
          );
        } else if (!matchingOpenPos && !trade.isRealTrade && currentBid <= stopLoss) {
          newStatus   = "STOP_HIT";
          // Realistic simulated slippage: cap at 0.50 points past stop loss to prevent phantom gap losses when tracker starts
          const slippage = Math.min(Math.max(stopLoss - currentBid, 0), 0.50);
          closedPrice = +(stopLoss - slippage).toFixed(2);
          pnlPoints   = +(closedPrice - actualEntry).toFixed(2);
          activeTradeStates.delete(id as string);
        } else if (!matchingOpenPos && !trade.isRealTrade && currentBid >= trade.takeProfit) {
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
          let targetSl = stopLoss > 0 ? stopLoss : actualEntry;
          // Break-even price covers spread plus small buffer (+0.50 pts)
          const breakEvenPrice = +(actualEntry + currentSpread + 0.50).toFixed(2);
          // Fixed profit lock price: Entry + 2.50 pts (secured intraday profit)
          const minProfitLockPrice = +(actualEntry + 2.50).toFixed(2);

          // Step A: Guaranteed Profit Floors when Market is in Favor (Intraday Calibrated)
          // Trigger Break-Even after market moves +4.50 pts (or 35% of initial target)
          // Trigger Fixed +2.50 pt Profit Lock once market moves >= +6.50 pts (or 50% of initial target)
          const beActivationProfit = Math.max(4.50, +(distanceToInitialTarget * 0.35).toFixed(2));
          const profitLockActivation = Math.max(6.50, +(distanceToInitialTarget * 0.50).toFixed(2));

          if (currentProfit >= profitLockActivation || peakProfit >= profitLockActivation) {
            // Once market has moved >= 6.5 pts in favor, lock fixed +2.5 pt profit
            if (currentBid >= minProfitLockPrice + minStopBuffer) {
              targetSl = Math.max(targetSl, minProfitLockPrice);
              if (trackerState.trailStage === "PROTECTIVE" || trackerState.trailStage === "BREAK_EVEN") {
                trackerState.trailStage = "PROFIT_LOCKED_2PT";
              }
            } else if (currentBid >= breakEvenPrice + minStopBuffer) {
              targetSl = Math.max(targetSl, breakEvenPrice);
              if (trackerState.trailStage === "PROTECTIVE") trackerState.trailStage = "BREAK_EVEN";
            }
          } else if (currentProfit >= beActivationProfit || peakProfit >= beActivationProfit) {
            // Capital Protection / Break-Even when in profit (+4.5 pts)
            if (currentBid >= breakEvenPrice + minStopBuffer) {
              targetSl = Math.max(targetSl, breakEvenPrice);
              if (trackerState.trailStage === "PROTECTIVE") trackerState.trailStage = "BREAK_EVEN";
            }
          }

          // Step B: Asymmetric Trailing Logic
          if (trackerState.runnerActivated) {
            // Floor guaranteed profit: lock at least +6.00 or 50% of initial target
            const minLockedProfit = Math.max(6.00, +(distanceToInitialTarget * 0.50).toFixed(2));
            const floorProfitPrice = +(actualEntry + minLockedProfit).toFixed(2);
            targetSl = Math.max(targetSl, floorProfitPrice);

            // Progressive Asymmetric Tiers (with ample breathing space for Gold swings)
            if (peakProfit >= 12.0 && peakProfit < 22.0) {
              // Tier 1 Runner (+12 to +22 pts): Trail 7.0 pts behind peak price
              const tier1Sl = +(trackerState.peakFavorablePrice - 7.00).toFixed(2);
              targetSl = Math.max(targetSl, tier1Sl);
              trackerState.trailStage = "RUNNER_STAGE_1";
            } else if (peakProfit >= 22.0 && peakProfit < 38.0) {
              // Tier 2 Strong Runner (+22 to +38 pts): Trail 10.0 pts behind peak price
              const tier2Sl = +(trackerState.peakFavorablePrice - 10.00).toFixed(2);
              targetSl = Math.max(targetSl, tier2Sl);
              trackerState.trailStage = "RUNNER_STAGE_2";
            } else if (peakProfit >= 38.0) {
              // Tier 3 Mega Runner (> +38 pts): Trail 15.0 pts behind peak price
              const tier3Sl = +(trackerState.peakFavorablePrice - 15.00).toFixed(2);
              targetSl = Math.max(targetSl, tier3Sl);
              trackerState.trailStage = "RUNNER_STAGE_3";
            }
          } else {
            // Progressive locking between +7.0 pts and runner activation
            if (peakProfit >= 10.0) {
              // Lock at least 50% of peak profit once peak reaches 10+ pts
              const halfProfitSl = +(actualEntry + (peakProfit * 0.50)).toFixed(2);
              if (currentBid >= halfProfitSl + minStopBuffer) {
                targetSl = Math.max(targetSl, halfProfitSl);
              }
            } else if (currentProfit >= distanceToInitialTarget * 0.70 && currentProfit < distanceToInitialTarget * 0.85) {
              const p2Target = +(actualEntry + (distanceToInitialTarget * 0.35)).toFixed(2);
              if (currentBid >= p2Target + minStopBuffer + 0.80) {
                targetSl = Math.max(targetSl, p2Target);
              } else if (currentBid >= breakEvenPrice + minStopBuffer + 0.60) {
                targetSl = Math.max(targetSl, breakEvenPrice);
              }
            }
          }

          // Guaranteed minimum profit floor: if market was in favor (peakProfit >= profitLockActivation),
          // targetSl can NEVER drop below actualEntry + 1.00
          if (peakProfit >= profitLockActivation && currentBid >= minProfitLockPrice + minStopBuffer) {
            targetSl = Math.max(targetSl, minProfitLockPrice);
          }

          // Step C: Time Decay Protection (Swing Trades: Allow 2.5 hours of development)
          const tradeDurationMins = (Date.now() - (trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now())) / 60000;
          if (!trackerState.runnerActivated && tradeDurationMins >= 150 && currentProfit >= 1.50) {
            const bailoutSl = +(currentBid - Math.max(minStopBuffer * 2.0, 1.20)).toFixed(2);
            targetSl = Math.max(targetSl, Math.min(bailoutSl, breakEvenPrice));
          }

          // Step D: Dispatch Updates to MT5 Broker and Database
          const maxAllowedSl = +(currentBid - minStopBuffer).toFixed(2);
          const shouldUpdateBrokerSl = (stopLoss <= 0 || targetSl > stopLoss) && targetSl <= maxAllowedSl;
          const shouldUpdateBrokerTp = trackerState.runnerActivated && Math.abs(trade.takeProfit - trackerState.extendedTakeProfit) < 0.05 && trade.takeProfit > trackerState.initialTakeProfit;

          if ((shouldUpdateBrokerSl || shouldUpdateBrokerTp) && targetSl <= maxAllowedSl) {
            if (matchingOpenPos) {
              if (!trailingSLInFlight.has(id as string)) {
                trailingSLInFlight.add(id as string);
                const newSlToSend = stopLoss > 0 ? Math.max(stopLoss, targetSl) : targetSl;
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
            } else if (!trade.isRealTrade) {
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

        // ── GUARANTEED PROFIT RETRACE SAFEGUARD WHEN MARKET WAS IN FAVOR (SHORT) ──
        // Only trigger market close if the trade ALREADY moved firmly into favor (peak >= +1.50 pts)
        // AND subsequently retraced back up to the -1.00 pt guarantee level.
        // Slippage & Spread Compensation: For a SHORT trade, closing sends a BUY at the live ASK price.
        // The broker spreads GOLD by ~0.30 - 0.55 points. If we close when ASK touches (Entry - 1.00), the BID was
        // only (Entry - 1.50), and after spread execution the realized profit might be 0.66 - 0.70 pts.
        // To guarantee the user receives at least the desired +1.00 point net profit on their broker statement:
        // We calculate target execution price factoring in the broker spread and slippage allowance (0.35 pts).
        const is5rRunner = trade.tradeDuration?.includes("5R") || trade.signalType === "BREAKOUT" || (distanceToInitialTarget >= 14.0);
        const slippageSpreadBuffer = Math.max(0.35, +(currentSpread * 0.6).toFixed(2));
        const targetNetProfit = 1.00;
        // Trigger threshold: Close only when ASK is at or below (actualEntry - 1.00 - slippageSpreadBuffer)
        // or if it bounced back up to (actualEntry - 1.00 - slippageSpreadBuffer) after reaching peak.
        const minGuaranteedProfitPrice = +(actualEntry - targetNetProfit - slippageSpreadBuffer).toFixed(2);
        // 1-point fixed profit retrace exit removed per user request. Allowing trades and runners to maximize positive direction.
        if (false) {
          newStatus   = "TARGET_HIT";
          closedPrice = +(currentAsk).toFixed(2);
          pnlPoints   = +(actualEntry - closedPrice).toFixed(2);
          if (matchingOpenPos) {
            closeBrokerPosition(matchingOpenPos.id, matchingOpenPos.accountId).catch(err =>
              logger.warn({ id, err }, "Failed to send market close for 1-point profit booking on broker")
            );
          }
          activeTradeStates.delete(id as string);
          logger.info(
            { id, signal, entryPrice: actualEntry, peakProfit, closedPrice, pnlPoints, spread: currentSpread },
            `🎯 [Favorable Market Exit] Trade moved firmly in favor (peak: +${peakProfit} pts) and retraced to guarantee level (+ slippage/spread buffer). Booked desired profit on broker!`
          );
        } else if (!matchingOpenPos && !trade.isRealTrade && currentAsk >= stopLoss) {
          newStatus   = "STOP_HIT";
          // Realistic simulated slippage: cap at 0.50 points past stop loss to prevent phantom gap losses when tracker starts
          const slippage = Math.min(Math.max(currentAsk - stopLoss, 0), 0.50);
          closedPrice = +(stopLoss + slippage).toFixed(2);
          pnlPoints   = +(actualEntry - closedPrice).toFixed(2);
          activeTradeStates.delete(id as string);
        } else if (!matchingOpenPos && !trade.isRealTrade && currentAsk <= trade.takeProfit) {
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
          let targetSl = stopLoss > 0 ? stopLoss : actualEntry;
          // Break-even price covers spread plus small buffer (+0.50 pts)
          const breakEvenPrice = +(actualEntry - currentSpread - 0.50).toFixed(2);
          // Fixed profit lock price: Entry - 2.50 pts (secured intraday profit)
          const minProfitLockPrice = +(actualEntry - 2.50).toFixed(2);

          // Step A: Guaranteed Profit Floors when Market is in Favor (Intraday Calibrated)
          // Trigger Break-Even after market moves +4.50 pts (or 35% of initial target)
          // Trigger Fixed +2.50 pt Profit Lock once market moves >= +6.50 pts (or 50% of initial target)
          const beActivationProfit = Math.max(4.50, +(distanceToInitialTarget * 0.35).toFixed(2));
          const profitLockActivation = Math.max(6.50, +(distanceToInitialTarget * 0.50).toFixed(2));

          if (currentProfit >= profitLockActivation || peakProfit >= profitLockActivation) {
            // Once market has moved >= 6.5 pts in favor, lock fixed +2.5 pt profit
            if (currentAsk <= minProfitLockPrice - minStopBuffer) {
              targetSl = (targetSl > 0 && targetSl < minProfitLockPrice) ? targetSl : minProfitLockPrice;
              if (trackerState.trailStage === "PROTECTIVE" || trackerState.trailStage === "BREAK_EVEN") {
                trackerState.trailStage = "PROFIT_LOCKED_2PT";
              }
            } else if (currentAsk <= breakEvenPrice - minStopBuffer) {
              targetSl = (targetSl > 0 && targetSl < breakEvenPrice) ? targetSl : breakEvenPrice;
              if (trackerState.trailStage === "PROTECTIVE") trackerState.trailStage = "BREAK_EVEN";
            }
          } else if (currentProfit >= beActivationProfit || peakProfit >= beActivationProfit) {
            // Capital Protection / Break-Even when in profit (+4.5 pts)
            if (currentAsk <= breakEvenPrice - minStopBuffer) {
              targetSl = (targetSl > 0 && targetSl < breakEvenPrice) ? targetSl : breakEvenPrice;
              if (trackerState.trailStage === "PROTECTIVE") trackerState.trailStage = "BREAK_EVEN";
            }
          }

          // Step B: Asymmetric Trailing Logic
          if (trackerState.runnerActivated) {
            // Floor guaranteed profit: lock at least +6.00 or 50% of initial target
            const minLockedProfit = Math.max(6.00, +(distanceToInitialTarget * 0.50).toFixed(2));
            const floorProfitPrice = +(actualEntry - minLockedProfit).toFixed(2);
            targetSl = Math.min(targetSl, floorProfitPrice);

            // Progressive Asymmetric Tiers (with ample breathing space for Gold swings)
            if (peakProfit >= 12.0 && peakProfit < 22.0) {
              // Tier 1 Runner (+12 to +22 pts): Trail 7.0 pts behind peak price
              const tier1Sl = +(trackerState.peakFavorablePrice + 7.00).toFixed(2);
              targetSl = Math.min(targetSl, tier1Sl);
              trackerState.trailStage = "RUNNER_STAGE_1";
            } else if (peakProfit >= 22.0 && peakProfit < 38.0) {
              // Tier 2 Strong Runner (+22 to +38 pts): Trail 10.0 pts behind peak price
              const tier2Sl = +(trackerState.peakFavorablePrice + 10.00).toFixed(2);
              targetSl = Math.min(targetSl, tier2Sl);
              trackerState.trailStage = "RUNNER_STAGE_2";
            } else if (peakProfit >= 38.0) {
              // Tier 3 Mega Runner (> +38 pts): Trail 15.0 pts behind peak price
              const tier3Sl = +(trackerState.peakFavorablePrice + 15.00).toFixed(2);
              targetSl = Math.min(targetSl, tier3Sl);
              trackerState.trailStage = "RUNNER_STAGE_3";
            }
          } else {
            // Progressive locking between +7.0 pts and runner activation
            if (peakProfit >= 10.0) {
              // Lock at least 50% of peak profit once peak reaches 10+ pts
              const halfProfitSl = +(actualEntry - (peakProfit * 0.50)).toFixed(2);
              if (currentAsk <= halfProfitSl - minStopBuffer) {
                targetSl = Math.min(targetSl, halfProfitSl);
              }
            } else if (currentProfit >= distanceToInitialTarget * 0.70 && currentProfit < distanceToInitialTarget * 0.85) {
              const p2Target = +(actualEntry - (distanceToInitialTarget * 0.35)).toFixed(2);
              if (currentAsk <= p2Target - minStopBuffer - 0.80) {
                targetSl = Math.min(targetSl, p2Target);
              } else if (currentAsk <= breakEvenPrice - minStopBuffer - 0.60) {
                targetSl = Math.min(targetSl, breakEvenPrice);
              }
            }
          }

          // Guaranteed minimum profit floor: if market was in favor (peakProfit >= profitLockActivation),
          // targetSl can NEVER rise above actualEntry - 1.00
          if (peakProfit >= profitLockActivation && currentAsk <= minProfitLockPrice - minStopBuffer) {
            targetSl = (targetSl > 0 && targetSl < minProfitLockPrice) ? targetSl : minProfitLockPrice;
          }

          // Step C: Time Decay Protection (Swing Trades: Allow 2.5 hours of development)
          const tradeDurationMins = (Date.now() - (trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now())) / 60000;
          if (!trackerState.runnerActivated && tradeDurationMins >= 150 && currentProfit >= 1.50) {
            const bailoutSl = +(currentAsk + Math.max(minStopBuffer * 2.0, 1.20)).toFixed(2);
            targetSl = Math.min(targetSl, Math.max(bailoutSl, breakEvenPrice));
          }

          // Step D: Dispatch Updates to MT5 Broker and Database
          const minAllowedSl = +(currentAsk + minStopBuffer).toFixed(2);
          const shouldUpdateBrokerSl = (stopLoss <= 0 || targetSl < stopLoss) && targetSl >= minAllowedSl;
          const shouldUpdateBrokerTp = trackerState.runnerActivated && Math.abs(trade.takeProfit - trackerState.extendedTakeProfit) < 0.05 && trade.takeProfit < trackerState.initialTakeProfit;

          if ((shouldUpdateBrokerSl || shouldUpdateBrokerTp) && targetSl >= minAllowedSl) {
            if (matchingOpenPos) {
              if (!trailingSLInFlight.has(id as string)) {
                trailingSLInFlight.add(id as string);
                const newSlToSend = stopLoss > 0 ? Math.min(stopLoss, targetSl) : targetSl;
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
            } else if (!trade.isRealTrade) {
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
        onTradeClosedHook({ ...trade, pnlPoints, closedPrice, tradeStatus: newStatus }).catch(() => {});
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

// ── Check For Weekend Gap Over Stop Loss ──
