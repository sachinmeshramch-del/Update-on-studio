import fs from 'fs';
const routerFile = 'artifacts/api-server/src/routes/trading.ts';
let code = fs.readFileSync(routerFile, 'utf8');

const route = `
router.get('/test-persist', async (req, res) => {
  try {
    const { insertSignal } = await import('@workspace/db');
    await insertSignal({
      signal: "SHORT", confidence: 99, entryPrice: 100, stopLoss: 110, takeProfit: 90,
      trend: "BEARISH", reason: "TEST PERSIST", tradeDuration: "5-30 minutes", tradeStatus: "RUNNING",
      closedPrice: null, closedAt: null, pnlPoints: null, marketStructure: null,
      bosPresent: null, liquiditySweep: null, inOrderBlock: null, smcScore: null,
      obScore: null, obType: null, obHigh: null, obLow: null, signalType: "RANGE",
      candlePattern: null, candleScore: null, isRealTrade: false
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err), stack: err.stack });
  }
});
`;

code = code.replace(/export default router;/, route + '\nexport default router;');
fs.writeFileSync(routerFile, code);
