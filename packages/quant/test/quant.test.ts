import type { Candle } from "@sisera/domain";
import { describe, expect, it } from "vitest";
import { analyzeCandles, conditionalValueAtRisk, detectSignalDrift } from "../src/index.js";

const candles: Candle[] = Array.from({ length: 60 }, (_, index) => ({
  time: 1_700_000_000 + index * 60,
  open: String(100 + index),
  high: String(102 + index),
  low: String(99 + index),
  close: String(101 + index),
  volume: String(1000 + index * 10),
}));

describe("legacy quant intelligence port", () => {
  it("scores a persistent trend with explainable component signals", () => {
    const intelligence = analyzeCandles(candles, new Date("2026-01-01T00:00:00Z"));
    expect(intelligence.direction).toBe("long");
    expect(intelligence.signals).toHaveLength(4);
    expect(intelligence.sampleSize).toBe(60);
  });

  it("computes expected shortfall from the loss tail", () => {
    expect(conditionalValueAtRisk([-0.2, -0.1, 0, 0.1, 0.2], 0.4)).toBeCloseTo(-0.15);
  });

  it("flags material feature drift", () => {
    const result = detectSignalDrift([0, 1, 0, 1, 0, 1, 0, 1, 0, 1], [4, 5, 4]);
    expect(result.drifted).toBe(true);
  });
});
