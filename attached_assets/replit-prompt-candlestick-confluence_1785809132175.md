# Replit AI Prompt — Candlestick Pattern Confluence Upgrade

Copy/paste this into Replit AI:

---

Upgrade the existing candlestick pattern detection module in this gold scalping app (XAU/USD). The module already detects: Shooting Star, Gravestone Doji, Hammer, Dragonfly Doji, Bullish Engulfing, and Bearish Engulfing. Improve it as follows:

**1. Add pattern strength scoring (not just binary detection)**
For each detected pattern, calculate a strength score (0-100) based on wick-to-body ratio:
- Shooting Star / Gravestone Doji: score scales with (upperWick / bodySize), capped at ratio 5:1 = 100 score
- Hammer / Dragonfly Doji: score scales with (lowerWick / bodySize), capped at ratio 5:1 = 100 score
- Engulfing patterns: score scales with (currentBodySize / previousBodySize), capped at ratio 3:1 = 100 score

**2. Require trend context before flagging a pattern as valid**
- Bearish patterns (Shooting Star, Gravestone Doji, Bearish Engulfing) only count as valid signals if price is in an uptrend over the prior N candles (use existing ATR/trend logic already in the app, or a simple EMA slope check if not present)
- Bullish patterns (Hammer, Dragonfly Doji, Bullish Engulfing) only count as valid if price is in a downtrend over the prior N candles
- If context doesn't match, still log the pattern detection but flag it as `context_invalid: true` and exclude it from signal generation

**3. Add confluence checking before firing a signal**
A candlestick pattern should only escalate to a tradeable signal when ALL of these align:
- Pattern strength score ≥ 60
- Context is valid (matches trend requirement above)
- Fundamental bias score supports the direction (bias > 0 for bullish patterns, bias < 0 for bearish patterns) — use the existing fundamental bias module
- Price is near a support/resistance level or ATR-based zone (use existing ATR stop-loss logic to define proximity, e.g. within 1x ATR of a recent swing high/low)

**4. Two-candle confirmation for Shooting Star / Hammer / Doji patterns**
For Shooting Star, Gravestone Doji, Hammer, and Dragonfly Doji specifically (not Engulfing), require the NEXT candle to close in the expected reversal direction before the signal is finalized. Store the pattern as `pending_confirmation` on detection, then confirm or discard on the following candle close.

**5. Update the JSON signal output structure**
Add these fields to the existing structured JSON signal output:
```json
{
  "pattern_detected": "Hammer",
  "pattern_strength": 78,
  "context_valid": true,
  "confluence_met": true,
  "confirmation_status": "confirmed",
  "existing_fields": "keep all current fields (entry, SL, TP, confidence, etc.)"
}
```

**6. Fold pattern strength into the existing confidence score**
Adjust the current confidence score calculation to include pattern strength as a weighted factor (suggest 20-25% weight, adjustable), alongside the existing fundamental bias and other factors already used.

Keep all existing functionality (Smart Mode, STRICT mode threshold, ATR stop-loss, risk/reward ratio) unchanged — this is purely an upgrade to the candlestick detection layer's accuracy and its integration into the signal confidence pipeline.
