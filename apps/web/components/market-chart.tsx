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
        background: { type: ColorType.Solid, color: "#14202a" },
        textColor: "#9dabb3",
        fontFamily: "IBM Plex Mono, ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#263640" },
        horzLines: { color: "#263640" },
      },
      rightPriceScale: { borderColor: "#30414b", scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: "#30414b", timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: "#71858c", labelBackgroundColor: "#34464d" },
        horzLine: { color: "#71858c", labelBackgroundColor: "#34464d" },
      },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#83c8ad",
      downColor: "#ed8585",
      borderVisible: false,
      wickUpColor: "#83c8ad",
      wickDownColor: "#ed8585",
      priceLineColor: "#c5d1d1",
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
        color: Number(candle.close) >= Number(candle.open) ? "#83c8ad50" : "#ed858550",
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
