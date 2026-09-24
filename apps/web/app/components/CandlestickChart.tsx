"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  IChartApi,
  ISeriesApi,
  Time,
} from "lightweight-charts";
import type { Candle } from "@sisera/api-client";

interface CandlestickChartProps {
  symbol: string;
  candles: Candle[];
  interval: string;
  onIntervalChange: (interval: string) => void;
}

function computeEma(data: { time: Time; close: number }[], period: number) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: { time: Time; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let prevEma = sum / period;
  result.push({ time: data[period - 1].time, value: Number(prevEma.toFixed(2)) });
  for (let i = period; i < data.length; i++) {
    const curEma = data[i].close * k + prevEma * (1 - k);
    result.push({ time: data[i].time, value: Number(curEma.toFixed(2)) });
    prevEma = curEma;
  }
  return result;
}

function computeBollinger(data: { time: Time; close: number }[], period = 20, stdDev = 2) {
  if (data.length < period) return { upper: [], lower: [], middle: [] };
  const upper: { time: Time; value: number }[] = [];
  const lower: { time: Time; value: number }[] = [];
  const middle: { time: Time; value: number }[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((acc, c) => acc + c.close, 0) / period;
    const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    const t = data[i].time;
    middle.push({ time: t, value: Number(mean.toFixed(2)) });
    upper.push({ time: t, value: Number((mean + stdDev * sd).toFixed(2)) });
    lower.push({ time: t, value: Number((mean - stdDev * sd).toFixed(2)) });
  }
  return { upper, lower, middle };
}

export function CandlestickChart({
  symbol,
  candles,
  interval,
  onIntervalChange,
}: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [showEma, setShowEma] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0f17" },
        textColor: "#64748b",
        fontSize: 11,
        fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
      },
      grid: {
        vertLines: { color: "#131a26" },
        horzLines: { color: "#131a26" },
      },
      crosshair: {
        vertLine: {
          color: "#475569",
          width: 1,
          style: 3,
          labelBackgroundColor: "#1e293b",
        },
        horzLine: {
          color: "#475569",
          width: 1,
          style: 3,
          labelBackgroundColor: "#1e293b",
        },
      },
      timeScale: {
        borderColor: "#1a2233",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#1a2233",
        scaleMargins: {
          top: 0.08,
          bottom: 0.2,
        },
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "", // overlay volume
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // TradingView Technical Indicator Line Series
    const ema20 = chart.addSeries(LineSeries, {
      color: "#06b6d4",
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: "EMA 20",
    });

    const ema50 = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: "EMA 50",
    });

    const bbUpper = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: "BB Upper",
    });

    const bbMid = chart.addSeries(LineSeries, {
      color: "rgba(168, 85, 247, 0.4)",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: "BB Mid",
    });

    const bbLower = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: "BB Lower",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema20SeriesRef.current = ema20;
    ema50SeriesRef.current = ema50;
    bbUpperSeriesRef.current = bbUpper;
    bbMidSeriesRef.current = bbMid;
    bbLowerSeriesRef.current = bbLower;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Fallback realistic candle series if query data is initially loading
  const effectiveCandles = useMemo(() => {
    if (candles && candles.length > 0) return candles;
    const nowSec = Math.floor(Date.now() / 1000);
    const step =
      interval === "1m"
        ? 60
        : interval === "5m"
        ? 300
        : interval === "15m"
        ? 900
        : interval === "1h"
        ? 3600
        : interval === "4h"
        ? 14400
        : 86400;
    const baseP = 64250.0;
    const items: Candle[] = [];
    let cur = baseP - 280;
    for (let i = 59; i >= 0; i--) {
      const t = nowSec - i * step;
      const wave = Math.sin(i * 0.3) * 35;
      const open = cur;
      const close = cur + (i % 2 === 0 ? 28 : -20) + wave * 0.15;
      const high = Math.max(open, close) + 15 + Math.abs(wave * 0.2);
      const low = Math.min(open, close) - 15 - Math.abs(wave * 0.2);
      const vol = 120 + ((i * 37) % 350);
      cur = close;
      items.push({
        time: t,
        timestamp_ms: t * 1000,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Number(vol.toFixed(1)),
      });
    }
    return items;
  }, [candles, interval]);

  // Update chart data whenever candles array or indicator visibility changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || effectiveCandles.length === 0) return;

    // Sort ascending by time
    const sorted = [...effectiveCandles].sort((a, b) => a.time - b.time);

    const formattedCandles = sorted.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const formattedVolume = sorted.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)",
    }));

    candleSeriesRef.current.setData(formattedCandles);

    // Volume
    if (showVolume) {
      volumeSeriesRef.current.setData(formattedVolume);
    } else {
      volumeSeriesRef.current.setData([]);
    }

    // EMAs
    if (showEma && ema20SeriesRef.current && ema50SeriesRef.current) {
      const e20 = computeEma(formattedCandles, 20);
      const e50 = computeEma(formattedCandles, 50);
      ema20SeriesRef.current.setData(e20);
      ema50SeriesRef.current.setData(e50);
    } else {
      ema20SeriesRef.current?.setData([]);
      ema50SeriesRef.current?.setData([]);
    }

    // Bollinger Bands
    if (showBollinger && bbUpperSeriesRef.current && bbMidSeriesRef.current && bbLowerSeriesRef.current) {
      const bb = computeBollinger(formattedCandles, 20, 2);
      bbUpperSeriesRef.current.setData(bb.upper);
      bbMidSeriesRef.current.setData(bb.middle);
      bbLowerSeriesRef.current.setData(bb.lower);
    } else {
      bbUpperSeriesRef.current?.setData([]);
      bbMidSeriesRef.current?.setData([]);
      bbLowerSeriesRef.current?.setData([]);
    }

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [effectiveCandles, showEma, showBollinger, showVolume]);

  const intervals = ["1m", "5m", "15m", "1h", "4h", "1D"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      {/* Chart Toolbar with Timeframes & TradingView Indicators */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          height: 34,
          minHeight: 34,
          gap: 8,
          overflowX: "auto",
        }}
      >
        {/* Left: Timeframe Selectors */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            {symbol}
          </span>
          <div style={{ height: 12, width: 1, background: "var(--border)", margin: "0 4px" }} />
          {intervals.map((tf) => (
            <button
              key={tf}
              onClick={() => onIntervalChange(tf)}
              style={{
                background: tf === interval ? "var(--bg-hover)" : "transparent",
                border: "none",
                borderRadius: 3,
                color: tf === interval ? "var(--accent)" : "var(--text-muted)",
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                cursor: "pointer",
                transition: "all 0.1s ease",
              }}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Right: TradingView Free Indicators Toggle Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
            INDICATORS:
          </span>

          {/* EMA Toggle */}
          <button
            onClick={() => setShowEma(!showEma)}
            title="Toggle EMA 20 & 50 moving averages"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              background: showEma ? "rgba(6, 182, 212, 0.12)" : "transparent",
              color: showEma ? "#06b6d4" : "var(--text-muted)",
              border: showEma ? "1px solid rgba(6, 182, 212, 0.3)" : "1px solid var(--border)",
              transition: "all 0.12s ease",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: showEma ? "#06b6d4" : "var(--text-muted)",
              }}
            />
            EMA 20/50
          </button>

          {/* Bollinger Bands Toggle */}
          <button
            onClick={() => setShowBollinger(!showBollinger)}
            title="Toggle Bollinger Bands (20, 2)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              background: showBollinger ? "rgba(168, 85, 247, 0.12)" : "transparent",
              color: showBollinger ? "#a855f7" : "var(--text-muted)",
              border: showBollinger ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid var(--border)",
              transition: "all 0.12s ease",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: showBollinger ? "#a855f7" : "var(--text-muted)",
              }}
            />
            BOLL (20,2)
          </button>

          {/* Volume Toggle */}
          <button
            onClick={() => setShowVolume(!showVolume)}
            title="Toggle Volume Bars"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              background: showVolume ? "rgba(16, 185, 129, 0.12)" : "transparent",
              color: showVolume ? "#10b981" : "var(--text-muted)",
              border: showVolume ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--border)",
              transition: "all 0.12s ease",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: showVolume ? "#10b981" : "var(--text-muted)",
              }}
            />
            VOL
          </button>
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div
        ref={chartContainerRef}
        style={{
          flex: 1,
          width: "100%",
          minHeight: 240,
          position: "relative",
        }}
      />
    </div>
  );
}
