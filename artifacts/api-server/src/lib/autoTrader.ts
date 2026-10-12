import { getSystemSettings, getRecentSignals } from "@workspace/db";
import { executeTradeOnAccount, getAccountFundsInfo, getSymbolSpec, getConfiguredSymbol } from "./metaApiFeed.js";
import { logger } from "./logger.js";
import { sendTelegramNotification } from "./telegram.js";
import { getLatestPrice } from "./priceEvents.js";

// Keep a local cache of daily stats
let dailyStats = {
    date: new Date().toISOString().split("T")[0],
    startEquity: 0,
    currentEquity: 0,
    dailyProfitPercent: 0,
    tradingHalted: false,
};

function getMetaApiConnection(accountId: string) {
    // This is a pseudo-function for the context of this example, we will inject the actual metaapi feed
}

// A new function to execute trade with Risk Management
export async function executeTradeWithCapitalManagement(
    accountId: string,
    accountType: "DEMO" | "REAL",
    direction: "LONG" | "SHORT",
    stopLoss: number,
    takeProfit: number,
    entryPrice: number,
    passedSettings?: any,
    signalTimestamp?: number
) {
    const isOrbEngine = settings.engineMode === "HYBRID_DUAL" || settings.engineMode === "DETERMINISTIC_ORB";
    const riskPerTrade = isOrbEngine ? (settings.orbRiskPerTrade ?? 2.0) : (settings.riskPerTradePercent ?? 1.0);
    const dailyTarget = settings.dailyProfitTargetPercent || 3.0;
    const dailyStop = settings.dailyStopLossPercent || 5.0;

    logger.info({ accountId, accountType, riskPerTrade, dailyTarget, dailyStop }, `[AutoTrader] Evaluating trade with capital management...`);

    // Fetch live equity and leverage from MetaApi (fast memory cache or terminal state)
    let fundsInfo = await getAccountFundsInfo(accountId);
    let actualEquity = fundsInfo ? fundsInfo.equity : null;
    let leverage = fundsInfo ? fundsInfo.leverage : 0;
    
    // Fetch precise symbol specifications to calculate exact pip values for ANY asset (Gold, Crypto, Indices)
    const sym = getConfiguredSymbol();
    let symbolSpec = await getSymbolSpec(accountId, sym);
    
    // Safe fallback if account funds info is pending
    if (!actualEquity || actualEquity <= 0) {
        logger.info({ accountId }, "[AutoTrader] Using safe $1000 fallback balance for initial lot sizing.");
        actualEquity = 1000;
    }

    // Risk amount = Equity * Risk%
    const riskAmount = actualEquity * (riskPerTrade / 100);
    // 1. HARD SL FLOOR (Calibrated for Gold Swings and Intraday)
    // Prevents micro-stops from generating inflated lot sizes.
    const safeSlDistance = Math.max(4.5, Math.abs(entryPrice - stopLoss));
    
    let calculatedVolume = 0.01;
    let lotStep = 0.01;
    let minVolume = 0.01;
    let riskPerLot = 0;
    
    if (symbolSpec && safeSlDistance > 0) {
        // MetaTrader 5 Formula: 
        // Profit = (Close - Open) * ContractSize * Volume
        // So RiskAmount = SL_Distance * ContractSize * Volume
        // Volume = RiskAmount / (SL_Distance * ContractSize)
        
        const tickSize = symbolSpec.tickSize || symbolSpec.point || 0.01;
        const tickValue = symbolSpec.tickValue; // e.g. 1.0 for USD accounts
        const contractSize = symbolSpec.contractSize || 100;
        
        lotStep = symbolSpec.volumeStep || 0.01;
        minVolume = symbolSpec.volumeMin || 0.01;
        
        if (tickValue && tickSize) {
            riskPerLot = (safeSlDistance / tickSize) * tickValue;
        } else {
            riskPerLot = safeSlDistance * contractSize;
        }
        
        if (riskPerLot > 0) {
            let exactVol = riskAmount / riskPerLot;
            // Round down to the nearest lotStep to ensure we don't exceed risk
            calculatedVolume = Math.floor(exactVol / lotStep) * lotStep;
        }
    } else {
        // Fallback to standard Gold logic (1 lot = 100 oz) if spec fails
        const slDistanceFallback = Math.max(4.5, safeSlDistance);
        if (slDistanceFallback > 0) {
            riskPerLot = slDistanceFallback * 100;
            calculatedVolume = parseFloat((riskAmount / riskPerLot).toFixed(2));
        }
    }
    
    // 2. EXCESSIVE RISK REJECTOR (Vulnerability #3 Fix)
    // If the account is so small that minVolume risks MORE than allowed tolerance, reject the trade.
    if (calculatedVolume < minVolume) {
        const actualRiskWithMinVolume = riskPerLot * minVolume;
        const actualRiskPct = (actualRiskWithMinVolume / actualEquity) * 100;
        
        if (actualRiskPct > Math.max(riskPerTrade * 3.5, 12.0) && actualRiskWithMinVolume > 20.0) { // Tolerance buffer
            const rejectMsg = `Account equity ($${actualEquity.toFixed(2)}) is too small for Stop Loss distance (${safeSlDistance.toFixed(1)}pt). Min lot (0.01) risks $${actualRiskWithMinVolume.toFixed(2)} (${actualRiskPct.toFixed(1)}% of equity, max allowed is ${Math.max(riskPerTrade * 3.5, 12.0).toFixed(1)}%).`;
            logger.warn({
                accountId, actualEquity, requestedRiskPct: riskPerTrade, actualRiskPct, minVolume, safeSlDistance
            }, `[AutoTrader] TRADE REJECTED: ${rejectMsg}`);

            sendTelegramNotification(
                `⚠️ <b>AUTO-TRADER RISK PROTECTION BLOCKED</b>\n\n` +
                `Account: <code>${accountType} (${accountId})</code>\n` +
                `Direction: <b>${direction}</b> @ ${entryPrice.toFixed(2)}\n` +
                `Stop Loss: <b>${stopLoss.toFixed(2)}</b> (${safeSlDistance.toFixed(1)} pts)\n\n` +
                `<b>Reason:</b> ${rejectMsg}\n\n` +
                `<i>Risk Shield prevented this trade to protect your account from losing over 500% of its equity on a single stop loss. Please deposit funds or adjust risk tolerance in Settings.</i>`
            ).catch(console.error);

            return {
                executed: false,
                reason: rejectMsg,
                actualEquity,
                actualRiskPct,
                minVolume,
                safeSlDistance
            };
        }
        calculatedVolume = minVolume;
    }
    
    // Cap at reasonable maximum (e.g. 50.0 lots) to prevent catastrophic errors
    const maxVol = symbolSpec?.volumeMax || 50.0;
    if (calculatedVolume > maxVol) calculatedVolume = maxVol;
    
    // Format to avoid floating point precision issues
    const stepDecimals = (lotStep.toString().split('.')[1] || '').length || 2;
    calculatedVolume = parseFloat(calculatedVolume.toFixed(stepDecimals));

    // 3. FREE MARGIN CHECK (Vulnerability #2 Fix)
    // Check if the calculated volume exceeds our available leverage
    if (leverage && leverage > 0) {
        const notionalValue = entryPrice * (symbolSpec?.contractSize || 100) * calculatedVolume;
        const marginRequired = notionalValue / leverage;
        const freeMargin = fundsInfo ? fundsInfo.freeMargin : actualEquity;
        
        if (marginRequired > freeMargin * 0.85) { // Leave 15% buffer
            logger.warn({ 
                accountId, freeMargin, marginRequired, calculatedVolume, leverage 
            }, "[AutoTrader] Margin Warning: Calculated volume requires more margin than safely available. Scaling down.");
            
            // Scale volume down to fit 85% of free margin
            const maxSafeNotional = (freeMargin * 0.85) * leverage;
            const maxSafeVolume = maxSafeNotional / (entryPrice * (symbolSpec?.contractSize || 100));
            calculatedVolume = Math.max(minVolume, Math.floor(maxSafeVolume / lotStep) * lotStep);
        }

        // Hard check: If even minVolume requires more margin than available free margin
        const finalMarginRequired = (entryPrice * (symbolSpec?.contractSize || 100) * calculatedVolume) / leverage;
        if (finalMarginRequired > freeMargin) {
            const marginMsg = `MT5 Free Margin ($${freeMargin.toFixed(2)}) is less than required margin ($${finalMarginRequired.toFixed(2)}) for minimum ${calculatedVolume} lot. Broker would reject with error 10019 (TRADE_RETCODE_NO_MONEY).`;
            logger.warn({ accountId, freeMargin, finalMarginRequired, calculatedVolume }, `[AutoTrader] TRADE REJECTED: ${marginMsg}`);

            sendTelegramNotification(
                `⚠️ <b>AUTO-TRADER MARGIN REJECTION</b>\n\n` +
                `Account: <code>${accountType} (${accountId})</code>\n` +
                `Direction: <b>${direction}</b> @ ${entryPrice.toFixed(2)}\n\n` +
                `<b>Reason:</b> ${marginMsg}\n\n` +
                `<i>Please deposit funds to your MT5 account to enable trade execution.</i>`
            ).catch(console.error);

            return {
                executed: false,
                reason: marginMsg,
                freeMargin,
                marginRequired: finalMarginRequired
            };
        }
    }

    logger.info({ accountId, actualEquity, leverage, riskAmount, calculatedVolume, symbol: sym }, `[AutoTrader] Dynamically calculated volume using broker specifications`);

    // Track daily drawdown and profit limits with automatic day-boundary reset
    const today = new Date().toISOString().split("T")[0];
    if (dailyStats.date !== today) {
        dailyStats.date = today;
        dailyStats.startEquity = actualEquity;
        dailyStats.currentEquity = actualEquity;
        dailyStats.tradingHalted = false;
        logger.info({ date: today, startEquity: actualEquity }, "[AutoTrader] New day detected: Reset daily risk limits and equity baseline");
    } else if (dailyStats.startEquity <= 0 && actualEquity > 0) {
        dailyStats.startEquity = actualEquity;
        dailyStats.currentEquity = actualEquity;
    }

    dailyStats.currentEquity = actualEquity;

    if (actualEquity && dailyStats.startEquity > 0) {
        const drawdownPct = ((dailyStats.startEquity - actualEquity) / dailyStats.startEquity) * 100;
        const profitPct = ((actualEquity - dailyStats.startEquity) / dailyStats.startEquity) * 100;

        if (drawdownPct >= dailyStop) {
            dailyStats.tradingHalted = true;
            logger.warn({ drawdownPct, dailyStop, startEquity: dailyStats.startEquity, actualEquity }, `[AutoTrader] Trading HALTED: Hit daily stop loss (${dailyStop}% max drawdown).`);
        } else if (dailyTarget > 0 && profitPct >= dailyTarget) {
            dailyStats.tradingHalted = true;
            logger.info({ profitPct, dailyTarget, startEquity: dailyStats.startEquity, actualEquity }, `[AutoTrader] Trading HALTED: Hit daily profit target (+${dailyTarget}%).`);
        }
    }

    if (dailyStats.tradingHalted) {
        logger.warn(`[AutoTrader] Trading is currently HALTED due to hitting daily limit.`);
        return {
            executed: false,
            reason: "Trading halted due to daily profit or drawdown limit."
        };
    }

    // Circuit Breaker Guard is now handled entirely by the SignalEngine before execution!

    try {
        logger.info({
            event: "DIAGNOSTIC_BACKEND_EXECUTION",
            accountId: accountId,
            direction: direction,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            volume: calculatedVolume,
            entryPrice: entryPrice
        }, "=== BACKEND AUTOTRADER EXECUTION DIAGNOSTIC ===");
        
        const result = await executeTradeOnAccount(
            accountId, 
            accountType, 
            direction, 
            stopLoss, 
            takeProfit, 
            calculatedVolume, 
            entryPrice, 
            signalTimestamp
        );
        logger.info({ accountId, accountType, calculatedVolume, orderId: result?.orderId }, `[AutoTrader] Trade Executed successfully with risk-adjusted volume`);
        sendTelegramNotification(`🤖 *AUTO-TRADER EXECUTED*\nAccount: ${accountType}\nDirection: ${direction}\nSize: ${calculatedVolume} Lots\nEntry: ${entryPrice}\nSL: ${stopLoss}\nTP: ${takeProfit}`).catch(console.error);
        return {
            executed: true,
            orderId: result?.orderId,
            positionId: result?.positionId,
            volume: calculatedVolume,
            ...result
        };
    } catch (e: any) {
        logger.error({ err: e.message || e, accountId, accountType }, `[AutoTrader] Execution failed.`);
        throw e;
    }
}
