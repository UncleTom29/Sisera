export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Point = { time: number; value: number };

export function sma(bars: Bar[], period: number): Point[] {
  const out: Point[] = [];
  let sum = 0;
  bars.forEach((bar, index) => {
    sum += bar.close;
    if (index >= period) sum -= bars[index - period]?.close ?? 0;
    if (index >= period - 1) out.push({ time: bar.time, value: sum / period });
  });
  return out;
}

export function ema(
  bars: Bar[],
  period: number,
  source: (bar: Bar) => number = (bar) => bar.close,
): Point[] {
  const out: Point[] = [];
  const k = 2 / (period + 1);
  let previous: number | null = null;
  bars.forEach((bar, index) => {
    const value = source(bar);
    if (index < period - 1) return;
    if (previous === null) {
      const seed =
        bars.slice(index - period + 1, index + 1).reduce((sum, item) => sum + source(item), 0) /
        period;
      previous = seed;
    } else previous = value * k + previous * (1 - k);
    out.push({ time: bar.time, value: previous });
  });
  return out;
}

export function bollinger(bars: Bar[], period = 20, deviations = 2) {
  const upper: Point[] = [];
  const middle: Point[] = [];
  const lower: Point[] = [];
  for (let index = period - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - period + 1, index + 1).map((bar) => bar.close);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const deviation = Math.sqrt(
      window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period,
    );
    const time = bars[index]?.time ?? 0;
    upper.push({ time, value: mean + deviations * deviation });
    middle.push({ time, value: mean });
    lower.push({ time, value: mean - deviations * deviation });
  }
  return { upper, middle, lower };
}

/** Volume-weighted average price, reset at each UTC day. */
export function vwap(bars: Bar[]): Point[] {
  let day = -1;
  let priceVolume = 0;
  let volume = 0;
  return bars.map((bar) => {
    const barDay = Math.floor(bar.time / 86_400);
    if (barDay !== day) {
      day = barDay;
      priceVolume = 0;
      volume = 0;
    }
    const typical = (bar.high + bar.low + bar.close) / 3;
    priceVolume += typical * (bar.volume || 1);
    volume += bar.volume || 1;
    return { time: bar.time, value: priceVolume / volume };
  });
}

export function rsi(bars: Bar[], period = 14): Point[] {
  const out: Point[] = [];
  let gain = 0;
  let loss = 0;
  for (let index = 1; index < bars.length; index += 1) {
    const change = (bars[index]?.close ?? 0) - (bars[index - 1]?.close ?? 0);
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (index <= period) {
      gain += up / period;
      loss += down / period;
      if (index < period) continue;
    } else {
      gain = (gain * (period - 1) + up) / period;
      loss = (loss * (period - 1) + down) / period;
    }
    out.push({
      time: bars[index]?.time ?? 0,
      value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss),
    });
  }
  return out;
}

export function macd(bars: Bar[], fast = 12, slow = 26, signal = 9) {
  const fastLine = new Map(ema(bars, fast).map((point) => [point.time, point.value]));
  const line = ema(bars, slow).flatMap((point) => {
    const value = fastLine.get(point.time);
    return value === undefined ? [] : [{ time: point.time, value: value - point.value }];
  });
  const signalBars = line.map((point) => ({
    time: point.time,
    open: 0,
    high: 0,
    low: 0,
    close: point.value,
    volume: 0,
  }));
  const signalLine = new Map(ema(signalBars, signal).map((point) => [point.time, point.value]));
  const histogram = line.flatMap((point) => {
    const value = signalLine.get(point.time);
    return value === undefined ? [] : [{ time: point.time, value: point.value - value }];
  });
  return {
    line,
    signal: [...signalLine.entries()].map(([time, value]) => ({ time, value })),
    histogram,
  };
}

/** Heikin-Ashi bars smooth noise by averaging each bar with the previous one. */
export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  bars.forEach((bar, index) => {
    const close = (bar.open + bar.high + bar.low + bar.close) / 4;
    const previous = out[index - 1];
    const open = previous ? (previous.open + previous.close) / 2 : (bar.open + bar.close) / 2;
    out.push({
      time: bar.time,
      open,
      close,
      high: Math.max(bar.high, open, close),
      low: Math.min(bar.low, open, close),
      volume: bar.volume,
    });
  });
  return out;
}
