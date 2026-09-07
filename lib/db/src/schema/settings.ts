export interface SystemSettings {
  id?: string;
  realAccountId: string;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;
  metaApiSymbol?: string;
  tradingMode?: "DEMO" | "REAL";
  riskPerTradePercent?: number;
  dailyProfitTargetPercent?: number;
  dailyStopLossPercent?: number;
}
