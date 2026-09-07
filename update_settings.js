const fs = require('fs');
const file = 'lib/db/src/schema/settings.ts';
let content = fs.readFileSync(file, 'utf8');

content = `export interface SystemSettings {
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
`;
fs.writeFileSync(file, content);
console.log("Updated settings.ts");
