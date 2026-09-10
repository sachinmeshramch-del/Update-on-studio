const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

// Replace LONG Trailing SL Logic
const longSearch = `            // Phase 1: At 25% to TP, move to TRUE BREAK-EVEN (must cover spread + 0.15 buffer)
            // Ensure live market has progressed sufficiently above breakEvenPrice so MT5 doesn't reject with 10016
            const breakEvenPrice = +(actualEntry + currentSpread + 0.15).toFixed(2);
            if (currentProfit >= distanceToTarget * 0.25 && currentProfit < distanceToTarget * 0.5) {
              if (currentBid >= breakEvenPrice + minStopBuffer) {
                targetSl = Math.max(stopLoss, breakEvenPrice);
              }
            }
            // Phase 2: At 50% to TP, lock in 25% of target profit
            else if (currentProfit >= distanceToTarget * 0.5 && currentProfit < distanceToTarget * 0.75) {
              const p2Target = +(actualEntry + (distanceToTarget * 0.25)).toFixed(2);
              if (currentBid >= p2Target + minStopBuffer) {
                targetSl = Math.max(stopLoss, p2Target);
              } else if (currentBid >= breakEvenPrice + minStopBuffer) {
                targetSl = Math.max(stopLoss, breakEvenPrice);
              }
            }
            // Phase 3: At 75% to TP, lock in 50% of target profit
            else if (currentProfit >= distanceToTarget * 0.75) {
              const p3Target = +(actualEntry + (distanceToTarget * 0.5)).toFixed(2);
              if (currentBid >= p3Target + minStopBuffer) {
                targetSl = Math.max(stopLoss, p3Target);
              } else {
                const p2Target = +(actualEntry + (distanceToTarget * 0.25)).toFixed(2);
                if (currentBid >= p2Target + minStopBuffer) {
                  targetSl = Math.max(stopLoss, p2Target);
                }
              }
            }`;

const longReplacement = `            // ── FASTER BREAK-EVEN TO REDUCE DRAWDOWN ──
            // If the trade reaches 1.5 points in profit, immediately lock the Stop Loss at Entry + spread + 0.1
            const breakEvenPrice = +(actualEntry + currentSpread + 0.1).toFixed(2);
            
            // Phase 1: Immediate Break-Even at 1.5 pts profit
            if (currentProfit >= 1.5 && currentProfit < distanceToTarget * 0.6) {
              if (currentBid >= breakEvenPrice + minStopBuffer) {
                targetSl = Math.max(stopLoss, breakEvenPrice);
              }
            }
            // Phase 2: Give TP Room to Breathe. Wait until 60% to TP to lock in wider profits.
            else if (currentProfit >= distanceToTarget * 0.6 && currentProfit < distanceToTarget * 0.8) {
              const p2Target = +(actualEntry + (distanceToTarget * 0.3)).toFixed(2);
              if (currentBid >= p2Target + minStopBuffer) {
                targetSl = Math.max(stopLoss, p2Target);
              } else if (currentBid >= breakEvenPrice + minStopBuffer) {
                targetSl = Math.max(stopLoss, breakEvenPrice);
              }
            }
            // Phase 3: At 80% to TP, lock in 60% of target profit
            else if (currentProfit >= distanceToTarget * 0.8) {
              const p3Target = +(actualEntry + (distanceToTarget * 0.6)).toFixed(2);
              if (currentBid >= p3Target + minStopBuffer) {
                targetSl = Math.max(stopLoss, p3Target);
              } else {
                const p2Target = +(actualEntry + (distanceToTarget * 0.3)).toFixed(2);
                if (currentBid >= p2Target + minStopBuffer) {
                  targetSl = Math.max(stopLoss, p2Target);
                }
              }
            }`;

// Replace SHORT Trailing SL Logic
const shortSearch = `            // Phase 1: At 25% to TP, move to TRUE BREAK-EVEN
            // Ensure live market has progressed sufficiently below breakEvenPrice so MT5 doesn't reject with 10016
            const breakEvenPrice = +(actualEntry - currentSpread - 0.15).toFixed(2);
            if (currentProfit >= distanceToTarget * 0.25 && currentProfit < distanceToTarget * 0.5) {
              if (currentAsk <= breakEvenPrice - minStopBuffer) {
                targetSl = Math.min(stopLoss, breakEvenPrice);
              }
            }
            // Phase 2: At 50% to TP, lock in 25% of target profit
            else if (currentProfit >= distanceToTarget * 0.5 && currentProfit < distanceToTarget * 0.75) {
              const p2Target = +(actualEntry - (distanceToTarget * 0.25)).toFixed(2);
              if (currentAsk <= p2Target - minStopBuffer) {
                targetSl = Math.min(stopLoss, p2Target);
              } else if (currentAsk <= breakEvenPrice - minStopBuffer) {
                targetSl = Math.min(stopLoss, breakEvenPrice);
              }
            }
            // Phase 3: At 75% to TP, lock in 50% of target profit
            else if (currentProfit >= distanceToTarget * 0.75) {
              const p3Target = +(actualEntry - (distanceToTarget * 0.5)).toFixed(2);
              if (currentAsk <= p3Target - minStopBuffer) {
                targetSl = Math.min(stopLoss, p3Target);
              } else {
                const p2Target = +(actualEntry - (distanceToTarget * 0.25)).toFixed(2);
                if (currentAsk <= p2Target - minStopBuffer) {
                  targetSl = Math.min(stopLoss, p2Target);
                }
              }
            }`;

const shortReplacement = `            // ── FASTER BREAK-EVEN TO REDUCE DRAWDOWN ──
            // If the trade reaches 1.5 points in profit, immediately lock the Stop Loss at Entry - spread - 0.1
            const breakEvenPrice = +(actualEntry - currentSpread - 0.1).toFixed(2);
            
            // Phase 1: Immediate Break-Even at 1.5 pts profit
            if (currentProfit >= 1.5 && currentProfit < distanceToTarget * 0.6) {
              if (currentAsk <= breakEvenPrice - minStopBuffer) {
                targetSl = Math.min(stopLoss, breakEvenPrice);
              }
            }
            // Phase 2: Give TP Room to Breathe. Wait until 60% to TP to lock in wider profits.
            else if (currentProfit >= distanceToTarget * 0.6 && currentProfit < distanceToTarget * 0.8) {
              const p2Target = +(actualEntry - (distanceToTarget * 0.3)).toFixed(2);
              if (currentAsk <= p2Target - minStopBuffer) {
                targetSl = Math.min(stopLoss, p2Target);
              } else if (currentAsk <= breakEvenPrice - minStopBuffer) {
                targetSl = Math.min(stopLoss, breakEvenPrice);
              }
            }
            // Phase 3: At 80% to TP, lock in 60% of target profit
            else if (currentProfit >= distanceToTarget * 0.8) {
              const p3Target = +(actualEntry - (distanceToTarget * 0.6)).toFixed(2);
              if (currentAsk <= p3Target - minStopBuffer) {
                targetSl = Math.min(stopLoss, p3Target);
              } else {
                const p2Target = +(actualEntry - (distanceToTarget * 0.3)).toFixed(2);
                if (currentAsk <= p2Target - minStopBuffer) {
                  targetSl = Math.min(stopLoss, p2Target);
                }
              }
            }`;

if (code.includes(longSearch)) {
  code = code.replace(longSearch, longReplacement);
  console.log("Successfully replaced LONG trailing logic");
} else {
  console.error("Could not find LONG trailing logic");
}

if (code.includes(shortSearch)) {
  code = code.replace(shortSearch, shortReplacement);
  console.log("Successfully replaced SHORT trailing logic");
} else {
  console.error("Could not find SHORT trailing logic");
}

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
