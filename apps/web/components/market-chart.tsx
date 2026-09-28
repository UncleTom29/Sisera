"use client";

import type { Candle } from "@sisera/domain";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

export function MarketChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
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
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      initialized.current = false;
    };
  }, []);

  useEffect(() => {
    if (!candles.length || !candleRef.current || !volumeRef.current || !chartRef.current) return;
    candleRef.current.setData(
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      })),
    );
    volumeRef.current.setData(
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        value: Number(candle.volume),
        color: Number(candle.close) >= Number(candle.open) ? "#83c8ad50" : "#ed858550",
      })),
    );
    if (!initialized.current) {
      chartRef.current.timeScale().fitContent();
      initialized.current = true;
    }
  }, [candles]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[420px] w-full"
      aria-label="Live candlestick chart"
    />
  );
}
