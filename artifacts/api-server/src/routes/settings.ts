import { Router } from "express";
import { getSystemSettings, updateSystemSettings } from "@workspace/db";
import { startMetaApiFeed, stopMetaApiFeed } from "../lib/metaApiFeed.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json(settings);
  } catch (err: any) {
    logger.error({ err }, "Error fetching settings");
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const newSettings = req.body;
    const oldSettings = await getSystemSettings();
    const settings = await updateSystemSettings(newSettings);
    
    // If trading mode or account ID changed, reconnect MetaApi
    if (
        oldSettings.tradingMode !== settings.tradingMode || 
        oldSettings.realAccountId !== settings.realAccountId ||
        
        oldSettings.metaApiSymbol !== settings.metaApiSymbol
    ) {
        logger.info("Trading mode or account ID changed, restarting MetaApi feed...");
        stopMetaApiFeed().then(() => startMetaApiFeed()).catch(e => logger.error({err: e}, "Failed to restart feed after setting change"));
    }
    
    res.json(settings);
  } catch (err: any) {
    logger.error({ err }, "Error updating settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
