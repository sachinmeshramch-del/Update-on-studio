const fs = require('fs');
let code = fs.readFileSync('./artifacts/api-server/src/lib/backtester.ts', 'utf8');

code = code.replace(
  `  calcEMA, detectTrend, calcRSI, calcMACD, calcATR, calcADX, calcVolumeSMA,
  detectMarketStructure, detectFVGZones, getFVGScore, detectLiquiditySweep,
  detectOrderBlocks, getOBScore, detectCHoCH, detectSweepRejection,
  detectCandlePattern, analyzeMarketRange, getNearestSwingLevels`,
  `  calcEMA, calcRSI, calcMACD, calcATR`
);

fs.writeFileSync('./artifacts/api-server/src/lib/backtester.ts', code);
