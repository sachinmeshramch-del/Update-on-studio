const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    if (finalSignal !== "HOLD" && effectiveTrend === "NEUTRAL") {
      if (isTrueBreakout) {
        logger.info({ finalSignal }, "[Breakout] True breakout detected. Bypassing NEUTRAL trend filter.");
      } else if (isFalseBreakout) {
        logger.info({ finalSignal }, "[Breakout] False breakout detected. Bypassing NEUTRAL trend filter.");
      } else {
        logger.warn({ finalSignal }, "[MacroFilter] Suppressed because effective trend is NEUTRAL");
        finalSignal = "HOLD";
        suppressionReason = "Strict macro-trend requirement: Market is currently NEUTRAL";
      }
    }`;

const replacement = `    if (finalSignal !== "HOLD" && effectiveTrend === "NEUTRAL") {
      if (isTrueBreakout) {
        logger.info({ finalSignal }, "[Breakout] True breakout detected. Bypassing NEUTRAL trend filter.");
      } else if (isFalseBreakout) {
        logger.info({ finalSignal }, "[Breakout] False breakout detected. Bypassing NEUTRAL trend filter.");
      } else if (signalType === "RANGE") {
        logger.info({ finalSignal }, "[MacroFilter] Range trade detected. Bypassing NEUTRAL trend filter.");
      } else {
        logger.warn({ finalSignal }, "[MacroFilter] Suppressed because effective trend is NEUTRAL");
        finalSignal = "HOLD";
        suppressionReason = "Strict macro-trend requirement: Market is currently NEUTRAL";
      }
    }`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
