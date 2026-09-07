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
    entryPrice: number
) {
    const settings = await getSystemSettings();
    const riskPerTrade = settings.riskPerTradePercent || 1.0;
    const dailyTarget = settings.dailyProfitTargetPercent || 3.0;
    const dailyStop = settings.dailyStopLossPercent || 5.0;

    logger.info({ accountId, riskPerTrade, dailyTarget, dailyStop }, `[AutoTrader] Evaluating trade with capital management...`);

    // Fetch live equity and leverage from MetaApi
    let fundsInfo = await getAccountFundsInfo(accountId);
    let actualEquity = fundsInfo ? fundsInfo.equity : null;
    let leverage = fundsInfo ? fundsInfo.leverage : 0;
    
    // Fallback if the connection failed
    if (!actualEquity || actualEquity <= 0) {
        logger.warn({ accountId }, "[AutoTrader] Could not fetch live equity, defaulting to $1000 fallback balance for safety.");
        actualEquity = 1000;
    }

    logger.info({ accountId, actualEquity, leverage, riskPerTrade }, `[AutoTrader] Dynamically calculating risk based on live available funds (Leverage: 1:${leverage})...`);

    // Risk amount = Equity * Risk%
    const riskAmount = actualEquity * (riskPerTrade / 100);
    // SL distance in pips/points (Gold)
    const slDistance = Math.abs(entryPrice - stopLoss);
    
    // Standard Gold Lot Size Calculation (approximate: 1 standard lot = 100 oz)
    // Pip value for 1.00 lot of Gold is $10 per $0.1 move. Let's use simple calculation:
    let calculatedVolume = 0.01;
    if (slDistance > 0) {
        // (RiskAmount) / (SLDistance * 100 contract size) 
        calculatedVolume = parseFloat((riskAmount / (slDistance * 100)).toFixed(2));
    }
    
    // Constrain volume
    if (calculatedVolume < 0.01) calculatedVolume = 0.01;
    if (calculatedVolume > 5.0) calculatedVolume = 5.0;

    logger.info({ accountId, slDistance, riskAmount, calculatedVolume }, `[AutoTrader] Dynamically calculated volume`);

    if (dailyStats.tradingHalted) {
        logger.warn(`[AutoTrader] Trading is currently HALTED due to hitting daily limit.`);
        return;
    }

    try {
        await executeTradeOnAccount(accountId, accountType, direction, stopLoss, takeProfit, calculatedVolume);
        logger.info(`[AutoTrader] Trade Executed successfully with risk-adjusted volume: ${calculatedVolume}`);
        sendTelegramNotification(`🤖 *AUTO-TRADER EXECUTED*\nAccount: ${accountType}\nDirection: ${direction}\nSize: ${calculatedVolume} Lots\nEntry: ${entryPrice}\nSL: ${stopLoss}\nTP: ${takeProfit}`).catch(console.error);
    } catch (e: any) {
        logger.error({ err: e.message || e }, `[AutoTrader] Execution failed.`);
    }
}
