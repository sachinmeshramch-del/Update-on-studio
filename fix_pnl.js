const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/tradeTracker.ts', 'utf8');

code = code.replace(
`        const finalPnl = signal === "LONG" ? (deal.price - entryPrice) : (entryPrice - deal.price);`,
`        const netProfit = (deal.profit || 0) + (deal.commission || 0) + (deal.swap || 0);
        const finalPnl = (deal.profit !== undefined && deal.profit !== null && deal.profit !== 0) 
            ? Number(netProfit.toFixed(2)) 
            : Number((signal === "LONG" ? (deal.price - entryPrice) : (entryPrice - deal.price)).toFixed(2));`
);

code = code.replace(
`          const finalPnl = signal === "LONG" ? (matchingDeal.price - entryPrice) : (entryPrice - matchingDeal.price);`,
`          const netProfit = (matchingDeal.profit || 0) + (matchingDeal.commission || 0) + (matchingDeal.swap || 0);
          const finalPnl = (matchingDeal.profit !== undefined && matchingDeal.profit !== null && matchingDeal.profit !== 0) 
            ? Number(netProfit.toFixed(2)) 
            : Number((signal === "LONG" ? (matchingDeal.price - entryPrice) : (entryPrice - matchingDeal.price)).toFixed(2));`
);

fs.writeFileSync('artifacts/api-server/src/lib/tradeTracker.ts', code);
