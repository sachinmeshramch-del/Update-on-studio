import { getClosedTrades } from "./lib/db/src/dao";

async function run() {
  const trades = await getClosedTrades(100);
  
  let fastLosses = 0;
  let slowLosses = 0;
  let fastWins = 0;
  let slowWins = 0;
  
  let totalLossPoints = 0;
  let totalWinPoints = 0;
  
  trades.forEach(t => {
    if (!t.createdAt || !t.closedAt) return;
    const durationMins = (new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 60000;
    
    if (t.pnlPoints < 0) {
      totalLossPoints += t.pnlPoints;
      if (durationMins < 15) fastLosses++;
      else slowLosses++;
    } else if (t.pnlPoints > 0) {
      totalWinPoints += t.pnlPoints;
      if (durationMins < 15) fastWins++;
      else slowWins++;
    }
  });

  console.log(JSON.stringify({
    fastLosses, slowLosses, fastWins, slowWins,
    avgLoss: totalLossPoints / (fastLosses + slowLosses || 1),
    avgWin: totalWinPoints / (fastWins + slowWins || 1),
  }, null, 2));
  
  process.exit(0);
}

run().catch(console.error);
