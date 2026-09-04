import { Router } from "express";
import { runBacktest } from "../lib/backtester.js";
import { getMetaApiHistoricalOHLC } from "../lib/metaApiFeed.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/run", async (req, res): Promise<any> => {
  try {
    const { 
      timeframe = "5m", 
      limit = 1000,
      initialBalance = 10000,
      positionSizing = "risk",
      riskPerTrade = 2,
      fixedLotSize = 0.1
    } = req.body;
    
    // Fetch historical candles from MetaApi for simulation
    logger.info(`Fetching ${limit} historical candles on ${timeframe} for backtest...`);
    const candles = await getMetaApiHistoricalOHLC(timeframe, limit);
    
    if (!candles || candles.length < 150) {
      return res.status(400).json({ error: "Not enough historical data from MetaApi to run a backtest (need at least 150 candles)." });
    }
    
    const results = runBacktest({
      candles,
      balance: parseFloat(initialBalance),
      positionSizing: positionSizing === "fixed" ? "fixed" : "risk",
      riskPerTradePercent: parseFloat(riskPerTrade),
      fixedLotSize: parseFloat(fixedLotSize)
    });
    
    res.json(results);
  } catch (err: any) {
    logger.error({ err }, "Backtest failed");
    res.status(500).json({ error: err.message || "Failed to run backtest" });
  }
});

export default router;
