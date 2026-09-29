"use client";

import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

/** A market's YES probability over time, in percent, on a Lightweight Charts area series. */
export function ProbabilityChart({
  history,
  height = 320,
}: {
  history: Array<{ time: number; value: number }>;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || history.length < 2) return;
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0c141b" },
        textColor: "#a5b1b7",
        fontFamily:
          getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() ||
          "monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(42,57,67,0.45)" },
        horzLines: { color: "rgba(42,57,67,0.45)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#2a3943", scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: "#2a3943", timeVisible: true },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#e9bd8c",
      topColor: "rgba(233,189,140,0.25)",
      bottomColor: "rgba(233,189,140,0.02)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (value: number) => `${value.toFixed(1)}%` },
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    const points = [...new Map(history.map((point) => [point.time, point.value])).entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as UTCTimestamp, value: value * 100 }));
    series.setData(points);
    series.createPriceLine({
      price: 50,
      color: "#43545c",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "",
    });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [history]);

  if (history.length < 2)
    return (
      <div className="grid place-items-center text-[13px] text-slate-400" style={{ height }}>
        Probability history is not available for this market yet.
      </div>
    );
  return <div ref={containerRef} style={{ height }} />;
}
