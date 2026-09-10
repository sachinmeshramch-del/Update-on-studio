const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/lib/signalEngine.ts', 'utf8');

code = code.replace(
`      trend5m: "NEUTRAL", trend1m: "NEUTRAL",
      },
    };`,
`      trend5m: "NEUTRAL", trend1m: "NEUTRAL",
      },
      circuitBreakerActive: false,
      circuitBreakerRemainingMinutes: 0,
      consecutiveLosses: 0,
    };`
);

code = code.replace(
`      spikeCooldownCandles: freshSpikeCooldownCandles,
      spikeCooldownRemaining: Math.max(0, Math.ceil((_spikeCdMs - _spikeElapsed) / 1000)),
    };`,
`      spikeCooldownCandles: freshSpikeCooldownCandles,
      spikeCooldownRemaining: Math.max(0, Math.ceil((_spikeCdMs - _spikeElapsed) / 1000)),
      circuitBreakerActive: false,
      circuitBreakerRemainingMinutes: 0,
      consecutiveLosses: 0,
    };`
);

code = code.replace(
`      candlePattern:      null,
      signalType:         "TREND_FOLLOW",
      patternDetected:    null,
      patternStrength:    0,
      contextValid:       false,
      confluenceMet:      false,
      confirmationStatus: null,
      indicators: {
        rsi: 50, ema9: currentPrice, ema21: currentPrice,
        macdLine: 0, macdSignal: 0, macdHistogram: 0, atr: 3,
        trend5m: "NEUTRAL", trend1m: "NEUTRAL",
      },
    };`,
`      candlePattern:      null,
      signalType:         "TREND_FOLLOW",
      patternDetected:    null,
      patternStrength:    0,
      contextValid:       false,
      confluenceMet:      false,
      confirmationStatus: null,
      indicators: {
        rsi: 50, ema9: currentPrice, ema21: currentPrice,
        macdLine: 0, macdSignal: 0, macdHistogram: 0, atr: 3,
        trend5m: "NEUTRAL", trend1m: "NEUTRAL",
      },
      circuitBreakerActive: false,
      circuitBreakerRemainingMinutes: 0,
      consecutiveLosses: 0,
    };`
);

// fix parameter implicit 'any' types
code = code.replace(
`    const completed = recentSignals.filter(r => r.tradeStatus === "STOP_HIT" || r.tradeStatus === "TARGET_HIT");`,
`    const completed = recentSignals.filter((r: any) => r.tradeStatus === "STOP_HIT" || r.tradeStatus === "TARGET_HIT");`
);


fs.writeFileSync('artifacts/api-server/src/lib/signalEngine.ts', code);
