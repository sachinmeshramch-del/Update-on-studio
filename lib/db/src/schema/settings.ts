export interface SystemSettings {
  id?: string;
  tradingMode: 'DEMO' | 'REAL';
  demoAccountId: string;
  realAccountId: string;
  autoTradingDemoEnabled: boolean;
  autoTradingRealEnabled: boolean;
  autoTradingEnabled?: boolean;
  metaApiSymbol?: string;
}
