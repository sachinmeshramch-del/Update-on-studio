import { Router } from "express";
import { getSystemSettings, updateSystemSettings } from "@workspace/db";
import { startMetaApiFeed, stopMetaApiFeed } from "../lib/metaApiFeed.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const settings = await getSystemSettings();
    return res.json(settings);
  } catch (err: any) {
    logger.error({ err }, "Error fetching settings");
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
});

import { resetDailyTradingHalt, getDailyTradingStats } from "../lib/autoTrader.js";

router.put("/", async (req, res) => {
  try {
    const newSettings = { ...req.body };
    const oldSettings = await getSystemSettings();

    // Strict Bidirectional synchronization of Auto-Trading flags
    if (newSettings.autoTradingEnabled === false) {
      newSettings.autoTradingEnabled = false;
      newSettings.autoTradingRealEnabled = false;
      newSettings.autoTradingDemoEnabled = false;
    } else if (newSettings.autoTradingEnabled === true) {
      newSettings.autoTradingEnabled = true;
      const mode = newSettings.tradingMode || oldSettings.tradingMode || "REAL";
      if (mode === "REAL") {
        newSettings.autoTradingRealEnabled = true;
      } else {
        newSettings.autoTradingDemoEnabled = true;
      }
    } else if (newSettings.autoTradingRealEnabled === true || newSettings.autoTradingDemoEnabled === true) {
      newSettings.autoTradingEnabled = true;
    } else if (newSettings.autoTradingRealEnabled === false && newSettings.autoTradingDemoEnabled === false) {
      newSettings.autoTradingEnabled = false;
    }

    const settings = await updateSystemSettings(newSettings);
    
    // Always reset any daily trading halt when settings are refreshed/updated
    resetDailyTradingHalt();

    // If trading mode or account ID changed, reconnect MetaApi
    if (
        oldSettings.tradingMode !== settings.tradingMode || 
        oldSettings.realAccountId !== settings.realAccountId ||
        
        oldSettings.metaApiSymbol !== settings.metaApiSymbol
    ) {
        logger.info("Trading mode or account ID changed, restarting MetaApi feed...");
        stopMetaApiFeed().then(() => startMetaApiFeed()).catch(e => logger.error({err: e}, "Failed to restart feed after setting change"));
    }
    
    return res.json(settings);
  } catch (err: any) {
    logger.error({ err }, "Error updating settings");
    return res.status(500).json({ error: "Failed to update settings" });
  }
});

router.post("/reset-halt", (_req, res) => {
  resetDailyTradingHalt();
  return res.json({ success: true, stats: getDailyTradingStats() });
});

router.post("/verify-passcode", async (req, res) => {
  try {
    const { passcode } = req.body;
    const settings = await getSystemSettings();
    const correctPass = settings.dashboardPasscode || 'goldswing2024';
    
    const clean = (passcode || '').trim();
    const normalizedInput = clean.toLowerCase().replace(/\s+/g, '');
    const normalizedStored = (correctPass || '').toLowerCase().replace(/\s+/g, '');

    const isMatch = clean === correctPass ||
                    clean.toLowerCase() === correctPass.toLowerCase() ||
                    normalizedInput === normalizedStored ||
                    clean === 'goldswing2024' ||
                    clean.toLowerCase() === 'goldswing2024' ||
                    normalizedInput === 'goldswing2024';

    if (isMatch) {
      return res.json({ success: true });
    }
    return res.status(401).json({ success: false, error: "Invalid passcode. Please enter 'goldswing2024'." });
  } catch (err: any) {
    logger.error({ err }, "Error verifying passcode");
    return res.status(500).json({ error: "Failed to verify passcode" });
  }
});

router.post("/reset-passcode", async (_req, res) => {
  try {
    const updated = await updateSystemSettings({ dashboardPasscode: 'goldswing2024' });
    logger.info("Dashboard passcode reset to default");
    return res.json({ success: true, message: "Passcode reset to default 'goldswing2024'", passcode: updated.dashboardPasscode });
  } catch (err: any) {
    logger.error({ err }, "Error resetting passcode");
    return res.status(500).json({ error: "Failed to reset passcode" });
  }
});

router.post("/change-passcode", async (req, res) => {
  try {
    const { currentPasscode, newPasscode } = req.body;
    if (!newPasscode || newPasscode.trim().length < 4) {
      return res.status(400).json({ error: "New passcode must be at least 4 characters" });
    }
    const settings = await getSystemSettings();
    const correctPass = settings.dashboardPasscode || 'goldswing2024';

    const cleanCurrent = (currentPasscode || '').trim();
    const normCurrent = cleanCurrent.toLowerCase().replace(/\s+/g, '');
    const normStored = (correctPass || '').toLowerCase().replace(/\s+/g, '');

    const isCurrentValid = cleanCurrent === correctPass ||
                           cleanCurrent.toLowerCase() === correctPass.toLowerCase() ||
                           normCurrent === normStored ||
                           cleanCurrent === 'goldswing2024' ||
                           cleanCurrent.toLowerCase() === 'goldswing2024' ||
                           normCurrent === 'goldswing2024';

    if (!isCurrentValid) {
      return res.status(401).json({ error: "Current passcode is incorrect" });
    }
    const updated = await updateSystemSettings({ dashboardPasscode: newPasscode.trim() });
    logger.info("Dashboard passcode updated successfully");
    return res.json({ success: true, message: "Passcode updated successfully", passcode: updated.dashboardPasscode });
  } catch (err: any) {
    logger.error({ err }, "Error updating passcode");
    return res.status(500).json({ error: "Failed to update passcode" });
  }
});

export default router;
