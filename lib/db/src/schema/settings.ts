export interface SystemSettings {
  id?: string;
  demoAccountId?: string;
  realAccountId: string;
  autoTradingDemoEnabled?: boolean;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;
  metaApiSymbol?: string;
  tradingMode?: "DEMO" | "REAL";
  riskPerTradePercent?: number;
  dailyProfitTargetPercent?: number;
  dailyStopLossPercent?: number;
  dashboardPasscode?: string;
}
