import { Router } from "express";
import { getMetaApiStatus } from "../lib/metaApiFeed.js";
import { getLatestSignal, getRunningTrades } from "@workspace/db";
import { getSystemSettings } from "@workspace/db";
import { logger } from "../lib/logger.js";
import MetaApi from 'metaapi.cloud-sdk';

const router = Router();

router.get("/sync", async (req, res) => {
  try {
    const [latestSignal, runningTrades, settings] = await Promise.all([
      getLatestSignal().catch(() => null),
      getRunningTrades().catch(() => []),
      getSystemSettings().catch(() => null)
    ]);

    const token = process.env.META_API_TOKEN;
    if (!token) {
        return res.status(500).json({ error: "META_API_TOKEN missing" });
    }
    
    // We import dynamically or just use standard import.
    // Given we are in the route, let's use the active account.
    const realAccountId = settings?.realAccountId?.trim();
    if (!realAccountId) {
        return res.json({ status: "skipped", reason: "No real account configured" });
    }

    const { default: MetaApiSdk } = await import("metaapi.cloud-sdk/esm-node");
    const metaApi = new MetaApiSdk(token);

    const account = await metaApi.metatraderAccountApi.getAccount(realAccountId);
    const rpc = account.getRPCConnection();
    await rpc.connect();
    await rpc.waitSynchronized({ timeoutInSeconds: 15 }).catch(() => null);

    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const endTime = new Date();
    const mt5Deals = await rpc.getDealsByTimeRange(startTime, endTime);

    // Fetch DB trades
    // To avoid writing complex Firestore queries in the express route without importing firebase admin,
    // we'll just check runningTrades and latestSignal
    
    let report = [];
    for (const trade of runningTrades) {
      if (!trade.isRealTrade) continue;
      
      const tradeTime = trade.createdAt.getTime();
      let matchedDeal = null;
      for (const deal of mt5Deals) {
        const dealTime = new Date(deal.time).getTime();
        const timeDiffMs = Math.abs(dealTime - tradeTime);
        const typeMatches = (trade.signal === 'LONG' && deal.type === 'DEAL_TYPE_BUY') || (trade.signal === 'SHORT' && deal.type === 'DEAL_TYPE_SELL');
        
        if (timeDiffMs < 5 * 60 * 1000 && typeMatches && deal.entry === 'DEAL_ENTRY_IN') {
          matchedDeal = deal;
          break;
        }
      }

      if (matchedDeal) {
        report.push({
            dbTradeId: trade.id,
            signal: trade.signal,
            dbEntryPrice: trade.entryPrice,
            status: "MATCHED",
            mt5DealId: matchedDeal.id,
            mt5FillPrice: matchedDeal.price,
            slippage: Math.abs(matchedDeal.price - trade.entryPrice).toFixed(2)
        });
      } else {
        report.push({
            dbTradeId: trade.id,
            signal: trade.signal,
            dbEntryPrice: trade.entryPrice,
            status: "DISCREPANCY",
            reason: "Saved in DB but missing in MT5 deal history."
        });
      }
    }

    res.json({
      metaApiStatus: getMetaApiStatus(),
      diagnostics: report
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Diagnostic sync failed");
    res.status(500).json({ error: err.message });
  }
});

export default router;
