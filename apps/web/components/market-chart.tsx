"use client";

import type { Candle } from "@sisera/domain";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

export function MarketChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#090d13" },
        textColor: "#667385",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#141d27" },
        horzLines: { color: "#141d27" },
      },
      rightPriceScale: { borderColor: "#1c2733", scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: "#1c2733", timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: "#435267", labelBackgroundColor: "#263343" },
        horzLine: { color: "#435267", labelBackgroundColor: "#263343" },
      },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#36c98f",
      downColor: "#ef6678",
      borderVisible: false,
      wickUpColor: "#36c98f",
      wickDownColor: "#ef6678",
      priceLineColor: "#8ea0b5",
    });
    candleSeries.setData(
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      })),
    );
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeries.setData(
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        value: Number(candle.volume),
        color: Number(candle.close) >= Number(candle.open) ? "#36c98f35" : "#ef667835",
      })),
    );
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[420px] w-full"
      aria-label="Live candlestick chart"
    />
  );
}
