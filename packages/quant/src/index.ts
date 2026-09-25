import type { Candle } from "@sisera/domain";

export type IndicatorSignal = {
  id: "trend" | "momentum" | "volatility" | "volume";
  label: string;
  value: number;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
};

export type MarketIntelligence = {
  score: number;
  regime: "risk_on" | "risk_off" | "transition";
  direction: "long" | "short" | "neutral";
  confidence: number;
  signals: IndicatorSignal[];
  observedAt: string;
  sampleSize: number;
};

export function simpleMovingAverage(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / period;
}

export function exponentialMovingAverage(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period))
    current = value * multiplier + current * (1 - multiplier);
  return current;
}

export function relativeStrengthIndex(values: readonly number[], period = 14): number | null {
  if (period <= 0 || values.length <= period) return null;
  const changes = values.slice(1).map((value, index) => value - (values[index] ?? value));
  const window = changes.slice(-period);
  const gain = window.reduce((sum, value) => sum + Math.max(value, 0), 0) / period;
  const loss = window.reduce((sum, value) => sum + Math.max(-value, 0), 0) / period;
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

export function averageTrueRange(candles: readonly Candle[], period = 14): number | null {
  if (period <= 0 || candles.length <= period) return null;
  const ranges = candles.slice(1).map((candle, index) => {
    const previous = candles[index];
    if (!previous) return 0;
    const high = Number(candle.high);
    const low = Number(candle.low);
    const previousClose = Number(previous.close);
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  });
  return simpleMovingAverage(ranges, period);
}

export function analyzeCandles(candles: readonly Candle[], now = new Date()): MarketIntelligence {
  if (candles.length < 30) throw new Error("At least 30 candles are required for intelligence");
  const closes = candles.map((candle) => Number(candle.close));
  const volumes = candles.map((candle) => Number(candle.volume));
  const latest = closes.at(-1) ?? 0;
  const fast = exponentialMovingAverage(closes, 12) ?? latest;
  const slow = exponentialMovingAverage(closes, 26) ?? latest;
  const rsi = relativeStrengthIndex(closes, 14) ?? 50;
  const atr = averageTrueRange(candles, 14) ?? 0;
  const averageVolume = simpleMovingAverage(volumes, 20) ?? 0;
  const latestVolume = volumes.at(-1) ?? 0;
  const trendScore = clamp(((fast - slow) / Math.max(Math.abs(slow), 1)) * 800, -100, 100);
  const momentumScore = clamp((rsi - 50) * 2, -100, 100);
  const volatilityPct = latest === 0 ? 0 : (atr / latest) * 100;
  const volatilityScore = clamp(45 - volatilityPct * 18, -100, 100);
  const volumeRatio = averageVolume === 0 ? 1 : latestVolume / averageVolume;
  const volumeScore = clamp((volumeRatio - 1) * 80, -100, 100);
  const signals: IndicatorSignal[] = [
    signal("trend", "EMA 12 / 26", fast - slow, trendScore),
    signal("momentum", "RSI 14", rsi, momentumScore),
    signal("volatility", "ATR 14", volatilityPct, volatilityScore),
    signal("volume", "Relative volume", volumeRatio, volumeScore),
  ];
  const score = signals.reduce((sum, item) => sum + item.score, 0) / signals.length;
  const confidence = Math.min(0.99, Math.abs(score) / 100 + 0.25);
  return {
    score: round(score),
    regime: score > 18 ? "risk_on" : score < -18 ? "risk_off" : "transition",
    direction: score > 12 ? "long" : score < -12 ? "short" : "neutral",
    confidence: round(confidence),
    signals,
    observedAt: now.toISOString(),
    sampleSize: candles.length,
  };
}

export function conditionalValueAtRisk(returns: readonly number[], alpha = 0.05): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((left, right) => left - right);
  const count = Math.max(1, Math.ceil(sorted.length * alpha));
  return sorted.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
}

export function detectSignalDrift(
  baseline: readonly number[],
  recent: readonly number[],
  threshold = 1.5,
): { drifted: boolean; zScore: number } {
  if (baseline.length < 10 || recent.length < 3) return { drifted: false, zScore: 0 };
  const baselineMean = mean(baseline);
  const variance = mean(baseline.map((value) => (value - baselineMean) ** 2));
  const deviation = Math.sqrt(variance);
  const zScore = deviation === 0 ? 0 : (mean(recent) - baselineMean) / deviation;
  return { drifted: Math.abs(zScore) >= threshold, zScore: round(zScore) };
}

function signal(
  id: IndicatorSignal["id"],
  label: string,
  value: number,
  score: number,
): IndicatorSignal {
  return {
    id,
    label,
    value: round(value),
    score: round(score),
    direction: score > 8 ? "bullish" : score < -8 ? "bearish" : "neutral",
    confidence: round(Math.min(0.99, Math.abs(score) / 100 + 0.2)),
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
