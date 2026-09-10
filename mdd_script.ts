import { getClosedTrades } from "./lib/db/src/dao";

async function analyze() {
  const trades = await getClosedTrades(1000);
  
  trades.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let cumulativePnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;
  
  let totalTrades = trades.length;
  let winningTrades = 0;
  
  for (const trade of trades) {
    if (trade.pnlPoints !== undefined && trade.pnlPoints !== null) {
      cumulativePnl += trade.pnlPoints;
      
      if (trade.pnlPoints > 0) {
        winningTrades++;
      }
      
      if (cumulativePnl > peakPnl) {
        peakPnl = cumulativePnl;
      }
      
      const drawdown = peakPnl - cumulativePnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  console.log(JSON.stringify({
    totalTrades,
    winningTrades,
    totalProfit: cumulativePnl,
    peakPnl,
    maxDrawdown,
    winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
  }, null, 2));
  
  process.exit(0);
}

analyze().catch(e => {
  console.error(e);
  process.exit(1);
});
