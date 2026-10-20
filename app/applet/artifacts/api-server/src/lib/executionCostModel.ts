export interface BrokerSymbolSpec {
  symbol: string;
  contractSize: number; // e.g. 100 for Gold (oz per lot)
  tickSize: number; // e.g. 0.01
  tickValue: number; // e.g. 1.0 (USD per tick per standard lot)
  digits: number; // 2 for Gold (e.g. 2650.50)
  minVolume: number; // 0.01
  maxVolume: number; // 50.0
  volumeStep: number; // 0.01
}

export const DEFAULT_GOLD_SPEC: BrokerSymbolSpec = {
  symbol: "GOLD",
  contractSize: 100,
  tickSize: 0.01,
  tickValue: 1.0,
  digits: 2,
  minVolume: 0.01,
  maxVolume: 50.0,
  volumeStep: 0.01,
};

export interface ExecutionCostSettings {
  spreadPoints: number; // e.g. 0.45 points ($0.45 on Gold)
  useHistoricalSpread: boolean; // Replay actual spread recorded with candle where available
  entrySlippagePoints: number; // e.g. 0.10 points
  exitSlippagePoints: number; // e.g. 0.10 points
  commissionPerLot: number; // e.g. $7.00 per standard lot round-turn
  swapLongPerDayPoints: number; // e.g. -0.25 points/day
  swapShortPerDayPoints: number; // e.g. +0.10 points/day
  intrabarAmbiguityPolicy: "CONSERVATIVE_SL_FIRST" | "OPTIMISTIC_TP_FIRST" | "FLAG_ONLY";
}

export const DEFAULT_COST_SETTINGS: ExecutionCostSettings = {
  spreadPoints: 0.45,
  useHistoricalSpread: true,
  entrySlippagePoints: 0.10,
  exitSlippagePoints: 0.10,
  commissionPerLot: 5.0, // $5.00/lot typical institutional ECN
  swapLongPerDayPoints: -0.15,
  swapShortPerDayPoints: 0.05,
  intrabarAmbiguityPolicy: "CONSERVATIVE_SL_FIRST",
};

export interface TradeExecutionPrices {
  entryPrice: number;
  effectiveSpreadPoints: number;
  entrySlippagePoints: number;
  exitSlippagePoints: number;
  totalCommissionDollars: number;
}

/**
 * Calculate realistic fill prices applying broker spread and directional slippage
 *
 * For a BUY (LONG):
 *   - Enters at Ask = Mid + (Spread / 2) + Entry Slippage
 *   - Exits at Bid  = Mid - (Spread / 2) - Exit Slippage
 *
 * For a SELL (SHORT):
 *   - Enters at Bid = Mid - (Spread / 2) - Entry Slippage
 *   - Exits at Ask  = Mid + (Spread / 2) + Exit Slippage
 */
export function calculateEntryExecution(
  direction: "LONG" | "SHORT",
  rawPrice: number,
  candleSpreadPoints: number | undefined,
  settings: ExecutionCostSettings,
  spec: BrokerSymbolSpec = DEFAULT_GOLD_SPEC
): { executionPrice: number; spreadPoints: number; slippagePoints: number } {
  const spread = settings.useHistoricalSpread && typeof candleSpreadPoints === "number" && candleSpreadPoints > 0
    ? candleSpreadPoints
    : settings.spreadPoints;

  const halfSpread = Number((spread / 2).toFixed(spec.digits));
  const slippage = settings.entrySlippagePoints;

  let executionPrice: number;
  if (direction === "LONG") {
    // Buyer enters on the Ask, pushed higher by slippage
    executionPrice = Number((rawPrice + halfSpread + slippage).toFixed(spec.digits));
  } else {
    // Seller enters on the Bid, pushed lower by slippage
    executionPrice = Number((rawPrice - halfSpread - slippage).toFixed(spec.digits));
  }

  return {
    executionPrice,
    spreadPoints: spread,
    slippagePoints: slippage,
  };
}

/**
 * Calculate realistic exit price applying broker spread, exit slippage and commission
 */
export function calculateExitExecution(
  direction: "LONG" | "SHORT",
  targetExitPrice: number,
  candleSpreadPoints: number | undefined,
  settings: ExecutionCostSettings,
  spec: BrokerSymbolSpec = DEFAULT_GOLD_SPEC
): { executionPrice: number; slippagePoints: number } {
  const slippage = settings.exitSlippagePoints;

  let executionPrice: number;
  if (direction === "LONG") {
    // Buyer closes by selling at Bid, reduced by exit slippage
    executionPrice = Number((targetExitPrice - slippage).toFixed(spec.digits));
  } else {
    // Seller closes by buying back at Ask, increased by exit slippage
    executionPrice = Number((targetExitPrice + slippage).toFixed(spec.digits));
  }

  return {
    executionPrice,
    slippagePoints: slippage,
  };
}

/**
 * Calculate exact Money PnL using the broker's specific contract specifications
 */
export function calculateMoneyPnL(params: {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  volume: number; // in standard lots (e.g. 0.01)
  durationHours: number;
  settings: ExecutionCostSettings;
  spec?: BrokerSymbolSpec;
}): {
  pnlPoints: number;
  grossProfitDollars: number;
  commissionDollars: number;
  swapDollars: number;
  netProfitDollars: number;
} {
  const { direction, entryPrice, exitPrice, volume, durationHours, settings } = params;
  const spec = params.spec || DEFAULT_GOLD_SPEC;

  // Points difference
  const rawPointsDiff = direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const pnlPoints = Number(rawPointsDiff.toFixed(spec.digits));

  // Gross profit: (Points / TickSize) * TickValue * (Volume / 1.0)
  // For Gold: (Points / 0.01) * 1.0 * (volume / 100) or simply Points * ContractSize * Volume
  const grossProfitDollars = Number((pnlPoints * spec.contractSize * volume).toFixed(2));

  // Commission: round turn per lot
  const commissionDollars = Number((settings.commissionPerLot * volume).toFixed(2));

  // Overnight swap: applied if trade crosses 24h intervals (approximated by duration in days)
  const daysHeld = Math.floor(durationHours / 24);
  let swapDollars = 0;
  if (daysHeld > 0) {
    const swapPointsPerDay = direction === "LONG" ? settings.swapLongPerDayPoints : settings.swapShortPerDayPoints;
    swapDollars = Number((swapPointsPerDay * spec.contractSize * volume * daysHeld).toFixed(2));
  }

  const netProfitDollars = Number((grossProfitDollars - commissionDollars + swapDollars).toFixed(2));

  return {
    pnlPoints,
    grossProfitDollars,
    commissionDollars,
    swapDollars,
    netProfitDollars,
  };
}

/**
 * Handle intrabar ambiguity where a single candle touches both Stop-Loss and Take-Profit.
 * Real-world OHLC data does not reveal intra-candle price sequence.
 */
export function resolveIntrabarCollision(params: {
  direction: "LONG" | "SHORT";
  candleHigh: number;
  candleLow: number;
  stopLoss: number;
  takeProfit: number;
  policy: ExecutionCostSettings["intrabarAmbiguityPolicy"];
}): {
  collisionOccurred: boolean;
  resolvedOutcome: "STOP_LOSS" | "TAKE_PROFIT" | "NEITHER";
  isAmbiguous: boolean;
} {
  const { direction, candleHigh, candleLow, stopLoss, takeProfit, policy } = params;

  let slTouched = false;
  let tpTouched = false;

  if (direction === "LONG") {
    slTouched = candleLow <= stopLoss;
    tpTouched = candleHigh >= takeProfit;
  } else {
    slTouched = candleHigh >= stopLoss;
    tpTouched = candleLow <= takeProfit;
  }

  // Both touched in the very same bar
  if (slTouched && tpTouched) {
    if (policy === "CONSERVATIVE_SL_FIRST") {
      return { collisionOccurred: true, resolvedOutcome: "STOP_LOSS", isAmbiguous: true };
    } else if (policy === "OPTIMISTIC_TP_FIRST") {
      return { collisionOccurred: true, resolvedOutcome: "TAKE_PROFIT", isAmbiguous: true };
    } else {
      // Default conservative
      return { collisionOccurred: true, resolvedOutcome: "STOP_LOSS", isAmbiguous: true };
    }
  }

  if (slTouched) return { collisionOccurred: false, resolvedOutcome: "STOP_LOSS", isAmbiguous: false };
  if (tpTouched) return { collisionOccurred: false, resolvedOutcome: "TAKE_PROFIT", isAmbiguous: false };

  return { collisionOccurred: false, resolvedOutcome: "NEITHER", isAmbiguous: false };
}
