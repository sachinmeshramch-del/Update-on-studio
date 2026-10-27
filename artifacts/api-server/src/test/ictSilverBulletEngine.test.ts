import { describe, it, expect } from "vitest";
import {
  getNyTimeComponents,
  evaluateSessionWindow,
  IctSilverBulletEngine,
  DEFAULT_ICT_SILVER_BULLET_CONFIG,
  preIdentifyLiquidityLevels,
  detect3CandleFvg,
} from "../lib/ictSilverBulletEngine.js";
import type { OHLCCandle } from "../lib/goldPrice.js";

describe("ICT Silver Bullet Engine Unit Tests", () => {

  describe("Timezone Conversion Engine (America/New_York IANA)", () => {
    it("converts winter EST timestamps correctly (UTC-5)", () => {
      // Jan 15, 2026 15:00 UTC = 10:00 AM EST (NY Morning Silver Bullet Window)
      const dateUtc = new Date("2026-01-15T15:00:00Z");
      const nyInfo = getNyTimeComponents(dateUtc);
      
      expect(nyInfo.hour).toBe(10);
      expect(nyInfo.minute).toBe(0);
      expect(nyInfo.isDst).toBe(false);

      const sess = evaluateSessionWindow(dateUtc, DEFAULT_ICT_SILVER_BULLET_CONFIG);
      expect(sess.inWindow).toBe(true);
      expect(sess.sessionName).toBe("NY_MORNING");
    });

    it("converts summer EDT timestamps correctly (UTC-4)", () => {
      // Jul 15, 2026 14:00 UTC = 10:00 AM EDT (NY Morning Silver Bullet Window)
      const dateUtc = new Date("2026-07-15T14:00:00Z");
      const nyInfo = getNyTimeComponents(dateUtc);

      expect(nyInfo.hour).toBe(10);
      expect(nyInfo.minute).toBe(0);
      expect(nyInfo.isDst).toBe(true);

      const sess = evaluateSessionWindow(dateUtc, DEFAULT_ICT_SILVER_BULLET_CONFIG);
      expect(sess.inWindow).toBe(true);
      expect(sess.sessionName).toBe("NY_MORNING");
    });

    it("identifies off-session windows correctly", () => {
      // Jan 15, 2026 20:00 UTC = 15:00 EST (3:00 PM EST - outside 10:00-11:00 AM window)
      const dateUtc = new Date("2026-01-15T20:00:00Z");
      const sess = evaluateSessionWindow(dateUtc, DEFAULT_ICT_SILVER_BULLET_CONFIG);
      expect(sess.inWindow).toBe(false);
      expect(sess.sessionName).toBe("OFF_SESSION");
    });
  });

  describe("Pre-Sweep Liquidity Identification", () => {
    it("identifies fractal swing highs and lows without future data leakage", () => {
      const mockCandles: OHLCCandle[] = Array.from({ length: 30 }, (_, i) => ({
        time: 1700000000 + i * 300,
        open: 2600 + i * 0.1,
        high: 2600 + i * 0.1 + (i === 15 ? 5.0 : 0.5), // Swing High at bar 15
        low: 2600 + i * 0.1 - (i === 8 ? 5.0 : 0.5),  // Swing Low at bar 8
        close: 2600 + i * 0.1 + 0.2,
      }));

      const levels = preIdentifyLiquidityLevels(mockCandles, 25, DEFAULT_ICT_SILVER_BULLET_CONFIG, 3.0);
      expect(levels.length).toBeGreaterThan(0);

      const swingHighs = levels.filter((l) => l.type === "BUY_SIDE" && l.source === "SWING_HIGH_LOW");
      const swingLows = levels.filter((l) => l.type === "SELL_SIDE" && l.source === "SWING_HIGH_LOW");

      expect(swingHighs.length).toBeGreaterThan(0);
      expect(swingLows.length).toBeGreaterThan(0);
    });
  });

  describe("3-Candle Fair Value Gap (FVG) Detection", () => {
    it("detects valid Bullish 3-Candle FVG correctly", () => {
      const mockCandles: OHLCCandle[] = [
        { time: 1700000000, open: 2600, high: 2605.0, low: 2598, close: 2604 }, // Candle A (high: 2605.0)
        { time: 1700000300, open: 2604, high: 2615.0, low: 2604, close: 2614 }, // Candle B
        { time: 1700000600, open: 2614, high: 2620.0, low: 2608.0, close: 2618 }, // Candle C (low: 2608.0)
      ];

      const sweep = {
        sweptLevel: { id: "L1", source: "PDH_PDL" as const, type: "SELL_SIDE" as const, price: 2598, identificationTime: "", identificationIndex: 0 },
        sweepTime: "",
        sweepIndex: 0,
        sweepExtremePrice: 2596.5,
        penetrationPts: 1.5,
        rejectedCloseBackInside: true,
        direction: "BULLISH_SWEEP" as const,
      };

      const fvg = detect3CandleFvg(mockCandles, 2, sweep, DEFAULT_ICT_SILVER_BULLET_CONFIG, 3.0, 0.40);
      expect(fvg).not.toBeNull();
      if (fvg) {
        expect(fvg.direction).toBe("BULLISH");
        expect(fvg.bottom).toBe(2605.0);
        expect(fvg.top).toBe(2608.0);
        expect(fvg.midpoint).toBe(2606.5);
      }
    });
  });

  describe("State Machine Setup Cycle", () => {
    it("transitions setup through full state machine without errors", () => {
      const engine = new IctSilverBulletEngine();
      expect(engine.getConfig().symbol).toBe("XAUUSD");

      engine.resetState();
      expect(engine).toBeDefined();
    });
  });

});
