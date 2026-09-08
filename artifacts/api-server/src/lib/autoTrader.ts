import { getSystemSettings } from "@workspace/db";
import { executeTradeOnAccount, getAccountFundsInfo } from "./metaApiFeed.js";
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
    const settings = passedSettings || await getSystemSettings();
    const riskPerTrade = settings.riskPerTradePercent || 1.0;
    const dailyTarget = settings.dailyProfitTargetPercent || 3.0;
    const dailyStop = settings.dailyStopLossPercent || 5.0;

    logger.info({ accountId, accountType, riskPerTrade, dailyTarget, dailyStop }, `[AutoTrader] Evaluating trade with capital management...`);

    // Fetch live equity and leverage from MetaApi (fast memory cache or terminal state)
    let fundsInfo = await getAccountFundsInfo(accountId);
    let actualEquity = fundsInfo ? fundsInfo.equity : null;
    let leverage = fundsInfo ? fundsInfo.leverage : 0;
    
    // Safe fallback if account funds info is pending
    if (!actualEquity || actualEquity <= 0) {
        logger.info({ accountId }, "[AutoTrader] Using safe $1000 fallback balance for initial lot sizing.");
        actualEquity = 1000;
    }

    // Risk amount = Equity * Risk%
    const riskAmount = actualEquity * (riskPerTrade / 100);
    // SL distance in pips/points (Gold) - minimum 1.0 point to prevent excessive lot size
    const rawSlDistance = Math.abs(entryPrice - stopLoss);
    const slDistance = Math.max(1.0, rawSlDistance);
    
    // Standard Gold Lot Size Calculation (approximate: 1 standard lot = 100 oz)
    let calculatedVolume = 0.01;
    if (slDistance > 0) {
        calculatedVolume = parseFloat((riskAmount / (slDistance * 100)).toFixed(2));
    }
    
    // Constrain volume safely
    if (isNaN(calculatedVolume) || calculatedVolume < 0.01) calculatedVolume = 0.01;
    if (calculatedVolume > 5.0) calculatedVolume = 5.0;

    logger.info({ accountId, actualEquity, leverage, riskAmount, calculatedVolume }, `[AutoTrader] Dynamically calculated volume`);

    if (dailyStats.tradingHalted) {
        logger.warn(`[AutoTrader] Trading is currently HALTED due to hitting daily limit.`);
        return;
    }

    try {
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
        return result;
    } catch (e: any) {
        logger.error({ err: e.message || e, accountId, accountType }, `[AutoTrader] Execution failed.`);
        throw e;
    }
}
