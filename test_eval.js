const settings = {
  "dashboardPasscode": "goldswing2024",
  "metaApiSymbol": "GOLD",
  "disableCooldowns": false,
  "realAccountId": "6485ceb1-f6b8-4a1d-85e4-af6de3033116",
  "autoTradingDemoEnabled": false,
  "autoTradingRealEnabled": true,
  "deltaRegion": "india",
  "tradingMode": "REAL",
  "demoAccountId": "5a1f5f0a-a31d-45be-bf0f-613abaf310f8",
  "autoTradingEnabled": false,
  "dailyStopLossPercent": 2
};
const isRealAuto = settings ? Boolean(settings.autoTradingRealEnabled || settings.autoTradingEnabled) : false;
console.log({isRealAuto});
