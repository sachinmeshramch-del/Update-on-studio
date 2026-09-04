const history = {
  "signals": [
    {
      "id": "97Og31usY37NI6vGqqtB",
      "signal": "SHORT",
      "confidence": 62,
      "entryPrice": 4422.85,
      "stopLoss": 4434.64,
      "takeProfit": 4393.37,
      "trend": "BEARISH",
      "reason": "NORMAL SHORT [London / New York] [conf:62% | SL:11.8pt TP:29.5pt] — EMA9 < EMA21 · RSI 38.5 · FVG entry zone · Liquidity swept",
      "timestamp": "2026-08-31T14:32:11.379Z",
      "tradeDuration": "5-30 minutes",
      "tradeStatus": "STOP_HIT",
      "closedPrice": 4434.64,
      "closedAt": "2026-08-31T14:39:30.298Z",
      "pnlPoints": -11.79,
      "signalType": "TREND_FOLLOW"
    },
    {
      "id": "7cbcLYnHXeqNTUhzNPY5",
      "signal": "LONG",
      "confidence": 70,
      "entryPrice": 4463.36,
      "stopLoss": 4450.74,
      "takeProfit": 4494.9,
      "trend": "BULLISH",
      "reason": "NORMAL LONG [London] [conf:70% | SL:12.6pt TP:31.5pt] — EMA9 > EMA21 · MACD bull · FVG entry zone · Liquidity swept",
      "timestamp": "2026-08-31T11:30:17.144Z",
      "tradeDuration": "5-30 minutes",
      "tradeStatus": "STOP_HIT",
      "closedPrice": 4450.74,
      "closedAt": "2026-08-31T12:25:38.471Z",
      "pnlPoints": -12.62,
      "signalType": "TREND_FOLLOW"
    }
  ]
};
console.log(history.signals[0].entryPrice < history.signals[0].stopLoss ? "SHORT SL CORRECT" : "WRONG");
