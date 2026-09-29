"use client";

import { useEffect, useRef } from "react";

/**
 * TradingView's Advanced Chart widget, with its full indicator and drawing toolset. Used for
 * symbols TradingView lists directly, such as the share behind a stock token or a Binance pair.
 */
export function TradingViewChart({
  symbol,
  interval = "60",
  height = 520,
}: {
  symbol: string;
  interval?: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML =
      '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#0c141b",
      gridColor: "rgba(42, 57, 67, 0.45)",
      allow_symbol_change: true,
      withdateranges: true,
      hide_side_toolbar: false,
      details: true,
      calendar: false,
      studies: ["STD;SMA", "STD;RSI"],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
    return () => {
      container.innerHTML = "";
    };
  }, [symbol, interval]);

  return (
    <div className="border border-line bg-panel" style={{ height }}>
      <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
    </div>
  );
}
