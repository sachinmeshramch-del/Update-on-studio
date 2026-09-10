const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

const longSearch = `            // ── FASTER BREAK-EVEN TO REDUCE DRAWDOWN ──
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

const longReplace = `            // ── DYNAMIC TRAILING SL (Profit Locking) ──
            const breakEvenPrice = +(actualEntry + currentSpread + 0.1).toFixed(2);
            
            // Phase 1: Break-Even (Trigger as early as 1.0 pt profit)
            if (currentProfit >= 1.0 && currentProfit < distanceToTarget * 0.5) {
              if (currentBid >= breakEvenPrice + minStopBuffer) {
                targetSl = Math.max(stopLoss, breakEvenPrice);
              }
            }
            // Phase 2: Lock 30% of target (when profit reaches 50% of target)
            else if (currentProfit >= distanceToTarget * 0.5 && currentProfit < distanceToTarget * 0.75) {
              const p2Target = +(actualEntry + (distanceToTarget * 0.3)).toFixed(2);
              if (currentBid >= p2Target + minStopBuffer) {
                targetSl = Math.max(stopLoss, p2Target);
              } else if (currentBid >= breakEvenPrice + minStopBuffer) {
                targetSl = Math.max(stopLoss, breakEvenPrice);
              }
            }
            // Phase 3: Lock 60% of target (when profit reaches 75% of target)
            else if (currentProfit >= distanceToTarget * 0.75) {
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

const shortSearch = `            // ── FASTER BREAK-EVEN TO REDUCE DRAWDOWN ──
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

const shortReplace = `            // ── DYNAMIC TRAILING SL (Profit Locking) ──
            const breakEvenPrice = +(actualEntry - currentSpread - 0.1).toFixed(2);
            
            // Phase 1: Break-Even (Trigger as early as 1.0 pt profit)
            if (currentProfit >= 1.0 && currentProfit < distanceToTarget * 0.5) {
              if (currentAsk <= breakEvenPrice - minStopBuffer) {
                targetSl = Math.min(stopLoss, breakEvenPrice);
              }
            }
            // Phase 2: Lock 30% of target (when profit reaches 50% of target)
            else if (currentProfit >= distanceToTarget * 0.5 && currentProfit < distanceToTarget * 0.75) {
              const p2Target = +(actualEntry - (distanceToTarget * 0.3)).toFixed(2);
              if (currentAsk <= p2Target - minStopBuffer) {
                targetSl = Math.min(stopLoss, p2Target);
              } else if (currentAsk <= breakEvenPrice - minStopBuffer) {
                targetSl = Math.min(stopLoss, breakEvenPrice);
              }
            }
            // Phase 3: Lock 60% of target (when profit reaches 75% of target)
            else if (currentProfit >= distanceToTarget * 0.75) {
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
    code = code.replace(longSearch, longReplace);
    console.log("Successfully patched LONG trailing SL");
} else {
    console.error("Could not find LONG trailing SL");
}

if (code.includes(shortSearch)) {
    code = code.replace(shortSearch, shortReplace);
    console.log("Successfully patched SHORT trailing SL");
} else {
    console.error("Could not find SHORT trailing SL");
}

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
