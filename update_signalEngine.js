const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Import FVG from technicalIndicators
if (!content.includes('detectFVG')) {
  content = content.replace('calcATR,', 'calcATR,\n  detectFVG,');
}

// 2. Add Telegram import
if (!content.includes('sendTelegramNotification')) {
  content = content.replace('import { logger } from "./logger.js";', 'import { logger } from "./logger.js";\nimport { sendTelegramNotification } from "./telegram.js";');
}

// 3. Update the spike detection logic in generateSignal to handle >4x ATR
const oldSpikeLogic = `      const isCleanBullishDisplacement = candle.close > candle.open && body >= atr * 1.5 && upperWick <= body * 0.35;
      const isCleanBearishDisplacement = candle.close < candle.open && body >= atr * 1.5 && lowerWick <= body * 0.35;
      const isDirectionalExpansion = isCleanBullishDisplacement || isCleanBearishDisplacement;

      // News chop spike: two-sided massive wicks (range much larger than body, or giant opposing wick)
      const isWhipsawSpike = (range > spikeThreshold * 2.0 && !isDirectionalExpansion) || (body > spikeThreshold && !isDirectionalExpansion);
      
      // Guard against wild currentPrice glitches from the feed
      const lastClose = candidates[1] ? candidates[1].close : candle.close;
      const isFeedGlitch = Math.abs(currentPrice - lastClose) > atr * 5.0;

      let spikeDetected = isWhipsawSpike || isFeedGlitch;`;

const newSpikeLogic = `      const isCleanBullishDisplacement = candle.close > candle.open && body >= atr * 1.5 && upperWick <= body * 0.35;
      const isCleanBearishDisplacement = candle.close < candle.open && body >= atr * 1.5 && lowerWick <= body * 0.35;
      const isDirectionalExpansion = isCleanBullishDisplacement || isCleanBearishDisplacement;

      // 🚨 Liquidity Plunge / Flash Crash Detection (4x ATR anomaly)
      const isFlashCrash = range >= atr * 4.0;
      
      if (isFlashCrash) {
         logger.warn({ range, atr }, "🚨 FLASH CRASH DETECTED! Massive liquidity plunge anomaly.");
         sendTelegramNotification("🚨 *FLASH CRASH DETECTED* 🚨\\nMassive liquidity plunge on Gold! Pausing normal trading algorithms to protect capital. Waiting for Fair Value Gap (FVG) recovery opportunity...").catch(console.error);
      }

      // News chop spike: two-sided massive wicks (range much larger than body, or giant opposing wick)
      const isWhipsawSpike = (range > spikeThreshold * 2.0 && !isDirectionalExpansion) || (body > spikeThreshold && !isDirectionalExpansion);
      
      // Guard against wild currentPrice glitches from the feed
      const lastClose = candidates[1] ? candidates[1].close : candle.close;
      const isFeedGlitch = Math.abs(currentPrice - lastClose) > atr * 5.0;

      let spikeDetected = isWhipsawSpike || isFeedGlitch || isFlashCrash;`;

content = content.replace(oldSpikeLogic, newSpikeLogic);

// 4. Implement FVG Recovery Strategy in the main signal logic
const oldFvgLogicString = `  const candleScore = bullishScore - bearishScore;`;
const newFvgLogicString = `  const candleScore = bullishScore - bearishScore;

  // 📈 FVG Liquidity Void Recovery Strategy
  const activeFVG = detectFVG(candles1m, 10);
  if (activeFVG) {
    if (activeFVG.type === "BEARISH") {
      // Massive drop left a gap. If we have formed a bottom (e.g. bullish crossover, or RSI oversold + bullish candle), buy the recovery!
      if (rsi < 40 && candleScore > 0 && currentPrice < activeFVG.bottom) {
        logger.info({ fvg: activeFVG }, "FVG Recovery Triggered!");
        return {
          confidence: 85, entryPrice: +(currentPrice.toFixed(2)),
          stopLoss: +(currentPrice - (atr * 1.5)).toFixed(2), takeProfit: +(activeFVG.bottom).toFixed(2), // Target the bottom of the FVG to fill it
          trend: "BULLISH", tradeDuration: "1-4 hours", signalStrength: 85,
          emaScore, rsiScore, macdScore, momentumScore, fvgScore: 10, sweepScore, obScore, candleScore,
          candlePattern: "FVG_RECOVERY", signalType: "REVERSAL", patternDetected: "Fair Value Gap Fill",
          patternStrength: 9, contextValid: true, confluenceMet: true, confirmationStatus: "STRONG",
          indicators: { rsi, ema9, ema21, macdLine: macd.line, macdSignal: macd.signal, macdHistogram: macd.histogram, atr, trend5m: trend5, trend1m: trend1 }
        };
      }
    } else if (activeFVG.type === "BULLISH") {
       // Massive pump left a gap. Play the pullback to fill it.
       if (rsi > 60 && candleScore < 0 && currentPrice > activeFVG.top) {
        logger.info({ fvg: activeFVG }, "FVG Pullback Triggered!");
        return {
          confidence: 85, entryPrice: +(currentPrice.toFixed(2)),
          stopLoss: +(currentPrice + (atr * 1.5)).toFixed(2), takeProfit: +(activeFVG.top).toFixed(2), // Target the top of the FVG to fill it
          trend: "BEARISH", tradeDuration: "1-4 hours", signalStrength: 85,
          emaScore, rsiScore, macdScore, momentumScore, fvgScore: -10, sweepScore, obScore, candleScore,
          candlePattern: "FVG_RECOVERY", signalType: "REVERSAL", patternDetected: "Fair Value Gap Fill",
          patternStrength: 9, contextValid: true, confluenceMet: true, confirmationStatus: "STRONG",
          indicators: { rsi, ema9, ema21, macdLine: macd.line, macdSignal: macd.signal, macdHistogram: macd.histogram, atr, trend5m: trend5, trend1m: trend1 }
        };
      }
    }
  }`;

content = content.replace(oldFvgLogicString, newFvgLogicString);

fs.writeFileSync(file, content);
console.log("Updated signalEngine.ts with Flash Crash & FVG logic");
