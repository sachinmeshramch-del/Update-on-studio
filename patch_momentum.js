const fs = require('fs');
const file = 'artifacts/api-server/src/lib/signalEngine.ts';
let code = fs.readFileSync(file, 'utf8');

const targetBlock = `      } else if (signalType === "TREND_FOLLOW") {
        // Prevent "late to the party" chasing (selling the bottom or buying the top)
        if (finalSignal === "SHORT" && (lastEma20_1h - currentPrice) > Math.max(atr * 0.6, 8.0)) {`;

const replacementBlock = `      } else if (signalType === "TREND_FOLLOW") {
        const isExtremeMomentum = currentAdx > 35; // ADX > 35 indicates a violent, extremely strong trend (Waterfall/Rocket)
        
        // Prevent "late to the party" chasing (selling the bottom or buying the top)
        if (finalSignal === "SHORT" && (lastEma20_1h - currentPrice) > Math.max(atr * 0.6, 8.0)) {
            if (isExtremeMomentum) {
                logger.info({ finalSignal, currentAdx, currentPrice }, "[Macro Gate] Extreme momentum detected. Bypassing overextension block to catch the waterfall.");
            } else {`;

code = code.replace(targetBlock, replacementBlock);

const targetBlock2 = `            finalSignal = "HOLD";
            suppressionReason = "Overextended downside: Price too far below 1H EMA20 to short safely.";
        } else if (finalSignal === "LONG" && (currentPrice - lastEma20_1h) > Math.max(atr * 0.6, 8.0)) {`;

const replacementBlock2 = `            finalSignal = "HOLD";
            suppressionReason = "Overextended downside: Price too far below 1H EMA20 to short safely. (ADX < 35)";
            }
        } else if (finalSignal === "LONG" && (currentPrice - lastEma20_1h) > Math.max(atr * 0.6, 8.0)) {
            if (isExtremeMomentum) {
                logger.info({ finalSignal, currentAdx, currentPrice }, "[Macro Gate] Extreme momentum detected. Bypassing overextension block to catch the rocket.");
            } else {`;

code = code.replace(targetBlock2, replacementBlock2);

const targetBlock3 = `            finalSignal = "HOLD";
            suppressionReason = "Overextended upside: Price too far above 1H EMA20 to long safely.";
        }
      }`;

const replacementBlock3 = `            finalSignal = "HOLD";
            suppressionReason = "Overextended upside: Price too far above 1H EMA20 to long safely. (ADX < 35)";
            }
        }
      }`;

code = code.replace(targetBlock3, replacementBlock3);

fs.writeFileSync(file, code);
console.log("Patched!");
