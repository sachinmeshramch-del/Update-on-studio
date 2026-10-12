import {
  calcEMA,
  calcRSI,
  calcMACD,
  calcATR,
  detectTrend,
  findSupportResistance,
  detectMarketStructure,
  detectLiquidityZones,
  detectBOS,
  detectOrderBlocks,
  getOBScore,
  detectCandlePattern,
  detectCHoCH,
  detectSweepRejection,
  calcADX,
  calcVolumeSMA,
  analyzeMarketRange,
  getNearestSwingLevels,
  detectFVG,
  type OHLCCandle
} from "../artifacts/api-server/src/lib/technicalIndicators.js";
import { calculateDynamicAtrStopLoss } from "../artifacts/api-server/src/lib/dynamicAtrStopLoss.js";

// Generate realistic Gold candles (starting around 2650.00)
function generateCandles(count: number, basePrice = 2650.0, trend = 0.2): OHLCCandle[] {
  const candles: OHLCCandle[] = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const time = new Date(now - (count - i) * 5 * 60 * 1000).toISOString();
    const noise = (Math.sin(i / 3) * 2.5) + (Math.random() - 0.48) * 3;
    const open = +(price).toFixed(2);
    const close = +(price + noise + trend).toFixed(2);
    const high = +(Math.max(open, close) + Math.random() * 2.5).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * 2.5).toFixed(2);
    const volume = Math.floor(100 + Math.random() * 500);
    candles.push({ time, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

async function runIndicatorTestSuite() {
  console.log("=================================================");
  console.log("   GOLD SWING AI PRO — INDICATOR VERIFICATION   ");
  console.log("=================================================");

  const normalCandles = generateCandles(100, 2650.0, 0.15);
  const closes = normalCandles.map(c => c.close);
  let passedCount = 0;
  let totalCount = 0;

  function assert(name: string, condition: boolean, detail: string) {
    totalCount++;
    if (condition) {
      console.log(`[PASS] ${name}: ${detail}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${name}: ${detail}`);
    }
  }

  // 1. EMA
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  assert("calcEMA", ema9.length === closes.length && !isNaN(ema9[ema9.length - 1]), `EMA9 len=${ema9.length}, latest=${ema9[ema9.length - 1]?.toFixed(2)}`);
  assert("calcEMA empty", calcEMA([], 9).length === 0, "Empty array handling safe");

  // 2. RSI
  const rsi = calcRSI(closes, 14);
  const latestRsi = rsi[rsi.length - 1];
  assert("calcRSI", rsi.length === closes.length && latestRsi >= 0 && latestRsi <= 100, `RSI14 latest=${latestRsi?.toFixed(2)} (within 0-100 range)`);

  // 3. MACD
  const macd = calcMACD(closes, 12, 26, 9);
  const latestHist = macd.histogram[macd.histogram.length - 1];
  assert("calcMACD", !isNaN(latestHist) && macd.macdLine.length === closes.length, `MACD hist=${latestHist?.toFixed(4)}, line=${macd.macdLine[macd.macdLine.length - 1]?.toFixed(4)}`);

  // 4. ATR
  const atr = calcATR(normalCandles, 14);
  const latestAtr = atr[atr.length - 1];
  assert("calcATR", atr.length > 0 && latestAtr > 0 && !isNaN(latestAtr), `ATR14 latest=${latestAtr?.toFixed(2)} (positive volatility)`);
  assert("calcATR single", calcATR([normalCandles[0]])[0] === 0, "Single candle returns [0]");

  // 5. detectTrend
  const trend = detectTrend(ema9, ema21);
  assert("detectTrend", ["BULLISH", "BEARISH", "NEUTRAL"].includes(trend), `Detected trend: ${trend}`);

  // 6. Support & Resistance
  const sr = findSupportResistance(normalCandles, 20);
  assert("findSupportResistance", sr.support <= sr.resistance && sr.support > 0, `Support=${sr.support}, Resistance=${sr.resistance}`);

  // 7. Market Structure
  const ms = detectMarketStructure(normalCandles);
  assert("detectMarketStructure", ["UPTREND", "DOWNTREND", "RANGING"].includes(ms.structure), `Structure=${ms.structure}, swingHighs=${ms.swingHighs.length}, swingLows=${ms.swingLows.length}`);

  // 8. Liquidity Zones
  const lz = detectLiquidityZones(normalCandles);
  assert("detectLiquidityZones", Array.isArray(lz), `Detected ${lz.length} liquidity zones`);

  // 9. BOS (Break of Structure)
  const bos = detectBOS(normalCandles, ms);
  assert("detectBOS", typeof bos.bullishBOS === "boolean" && typeof bos.bearishBOS === "boolean", `bullishBOS=${bos.bullishBOS}, bearishBOS=${bos.bearishBOS}, level=${bos.bosLevel}`);

  // 10. Order Blocks (OB) & OB Score
  const obs = detectOrderBlocks(normalCandles, latestAtr);
  const bullObScore = getOBScore(obs.bullishOB);
  const bearObScore = getOBScore(obs.bearishOB);
  assert("detectOrderBlocks & getOBScore", typeof bullObScore === "number" && typeof bearObScore === "number", `Bull OB score=${bullObScore}, Bear OB score=${bearObScore}`);

  // 11. Candlestick Pattern Detection
  const candlePat = detectCandlePattern(normalCandles, latestAtr);
  assert("detectCandlePattern", typeof candlePat.patternStrength === "number" && typeof candlePat.confluenceMet === "boolean", `Pattern=${candlePat.pattern || "none"}, bias=${candlePat.bias}, strength=${candlePat.patternStrength}`);

  // 12. CHoCH (Change of Character)
  const choch = detectCHoCH(normalCandles, trend);
  assert("detectCHoCH", typeof choch.detected === "boolean", `CHoCH detected=${choch.detected}, direction=${choch.direction}, level=${choch.level}`);

  // 13. Sweep Rejection
  const sweep = detectSweepRejection(normalCandles, latestAtr);
  assert("detectSweepRejection", typeof sweep.detected === "boolean", `Sweep detected=${sweep.detected}, type=${sweep.rejectionType}, sweptLevel=${sweep.sweptLevel}`);

  // 14. ADX + DI
  const adx = calcADX(normalCandles, 14);
  const latestAdx = adx.adx[adx.adx.length - 1];
  assert("calcADX", adx.adx.length === normalCandles.length && !isNaN(latestAdx), `ADX latest=${latestAdx?.toFixed(2)}, plusDI=${adx.plusDI[adx.plusDI.length - 1]?.toFixed(2)}, minusDI=${adx.minusDI[adx.minusDI.length - 1]?.toFixed(2)}`);

  // 15. Volume SMA
  const volSma = calcVolumeSMA(normalCandles, 20);
  assert("calcVolumeSMA", volSma.length === normalCandles.length && !isNaN(volSma[volSma.length - 1]), `Vol SMA20 latest=${volSma[volSma.length - 1]?.toFixed(0)}`);

  // 16. analyzeMarketRange
  const range = analyzeMarketRange(normalCandles, closes[closes.length - 1], latestAtr, 30);
  assert("analyzeMarketRange", typeof range.isRanging === "boolean" && ["SUPPORT_ZONE", "RESISTANCE_ZONE", "MID_CHOP_ZONE"].includes(range.position), `Range isRanging=${range.isRanging}, position=${range.position}, span=${range.rangeSpan}`);

  // 17. getNearestSwingLevels
  const nearestSwings = getNearestSwingLevels(normalCandles, 25);
  assert("getNearestSwingLevels", nearestSwings.nearestSwingHigh === null || typeof nearestSwings.nearestSwingHigh === "number", `Nearest swing high=${nearestSwings.nearestSwingHigh}, low=${nearestSwings.nearestSwingLow}`);

  // 18. detectFVG
  const fvg = detectFVG(normalCandles, 10);
  assert("detectFVG", fvg === null || (typeof fvg.top === "number" && typeof fvg.bottom === "number"), `FVG=${fvg ? `${fvg.type} [${fvg.bottom} - ${fvg.top}]` : "None detected"}`);

  // 19. Dynamic ATR Stop Loss Calculator
  const dynamicSL = calculateDynamicAtrStopLoss({
    currentPrice: closes[closes.length - 1],
    direction: "LONG",
    atr: latestAtr,
    candlesPrimary: normalCandles,
    currentAdx: latestAdx,
    liveSpread: 0.25,
    accountEquity: 10000,
    riskPercent: 1.5,
  });
  assert(
    "calculateDynamicAtrStopLoss",
    dynamicSL.stopLossPrice < closes[closes.length - 1] && dynamicSL.stopLossDistance > 0,
    `Dynamic SL=${dynamicSL.stopLossPrice.toFixed(2)}, dist=${dynamicSL.stopLossDistance.toFixed(2)} pts, mult=${dynamicSL.atrMultiplier}x, safety=${dynamicSL.liquidationSafety.status}`
  );

  console.log("=================================================");
  console.log(`RESULT: ${passedCount} / ${totalCount} indicator checks PASSED!`);
  console.log("=================================================");
}

runIndicatorTestSuite().catch(e => {
  console.error("Test run error:", e);
  process.exit(1);
});
