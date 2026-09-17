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
    const settings = passedSettings || await getSystemSettings();
    const riskPerTrade = settings.riskPerTradePercent || 1.0;
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
    // SL distance in pips/points - minimum distance fallback to prevent excessive lot size
    const rawSlDistance = Math.abs(entryPrice - stopLoss);
    
    let calculatedVolume = 0.01;
    let lotStep = 0.01;
    let minVolume = 0.01;
    
    if (symbolSpec && rawSlDistance > 0) {
        // MetaTrader 5 Formula: 
        // Profit = (Close - Open) * ContractSize * Volume
        // So RiskAmount = SL_Distance * ContractSize * Volume
        // Volume = RiskAmount / (SL_Distance * ContractSize)
        // Note: For forex, there's also exchange rate, but for USD pairs/metals it's 1.
        
        // Sometimes brokers define tickValue and tickSize.
        // RiskAmount = (SL_Distance / tickSize) * tickValue * Volume
        const tickSize = symbolSpec.tickSize || symbolSpec.point || 0.01;
        const tickValue = symbolSpec.tickValue; // e.g. 1.0 for USD accounts
        const contractSize = symbolSpec.contractSize || 100;
        
        lotStep = symbolSpec.volumeStep || 0.01;
        minVolume = symbolSpec.volumeMin || 0.01;
        
        let riskPerLot = 0;
        if (tickValue && tickSize) {
            riskPerLot = (rawSlDistance / tickSize) * tickValue;
        } else {
            riskPerLot = rawSlDistance * contractSize;
        }
        
        if (riskPerLot > 0) {
            let exactVol = riskAmount / riskPerLot;
            // Round down to the nearest lotStep to ensure we don't exceed risk
            calculatedVolume = Math.floor(exactVol / lotStep) * lotStep;
        }
    } else {
        // Fallback to standard Gold logic (1 lot = 100 oz) if spec fails
        const slDistanceFallback = Math.max(1.0, rawSlDistance);
        if (slDistanceFallback > 0) {
            calculatedVolume = parseFloat((riskAmount / (slDistanceFallback * 100)).toFixed(2));
        }
    }
    
    // Constrain volume safely based on symbol spec
    if (isNaN(calculatedVolume) || calculatedVolume < minVolume) calculatedVolume = minVolume;
    // Cap at reasonable maximum (e.g. 50.0 lots) to prevent catastrophic errors
    const maxVol = symbolSpec?.volumeMax || 50.0;
    if (calculatedVolume > maxVol) calculatedVolume = maxVol;
    
    // Format to avoid floating point precision issues (e.g. 0.01000000000001)
    const stepDecimals = (lotStep.toString().split('.')[1] || '').length || 2;
    calculatedVolume = parseFloat(calculatedVolume.toFixed(stepDecimals));

    logger.info({ accountId, actualEquity, leverage, riskAmount, calculatedVolume, symbol: sym }, `[AutoTrader] Dynamically calculated volume using broker specifications`);

    if (dailyStats.tradingHalted) {
        logger.warn(`[AutoTrader] Trading is currently HALTED due to hitting daily limit.`);
        return;
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
        return result;
    } catch (e: any) {
        logger.error({ err: e.message || e, accountId, accountType }, `[AutoTrader] Execution failed.`);
        throw e;
    }
}
