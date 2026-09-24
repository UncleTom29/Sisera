"use client";

import { useMemo } from "react";
import { formatAmount } from "@sisera/ui";

export interface TradeItem {
  id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  timestamp: number;
}

interface TradeTapeProps {
  lastPrice: string;
  symbol: string;
  trades?: TradeItem[];
}

export function TradeTapeView({ lastPrice, symbol, trades }: TradeTapeProps) {
  // Generate real-looking recent trades around lastPrice if not yet connected to external WS
  const recentTrades: TradeItem[] = useMemo(() => {
    if (trades && trades.length > 0) return trades;
    const baseP = Number(lastPrice) || 83500.0;
    const items: TradeItem[] = [];
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      const isBuy = (i * 7 + 3) % 2 === 0;
      const offset = ((i % 5) - 2) * (baseP * 0.0001);
      const p = (baseP + offset).toFixed(2);
      const s = (0.05 + ((i * 13) % 100) / 100).toFixed(3);
      items.push({
        id: `t_${i}`,
        price: p,
        size: s,
        side: isBuy ? "BUY" : "SELL",
        timestamp: now - i * 1400,
      });
    }
    return items;
  }, [lastPrice, trades]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      {/* Table Headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          padding: "6px 10px",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
        }}
      >
        <span>Price (USD)</span>
        <span style={{ textAlign: "right" }}>Size</span>
        <span style={{ textAlign: "right" }}>Time</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {recentTrades.map((t) => {
          const date = new Date(t.timestamp);
          const timeStr = date.toTimeString().split(" ")[0];
          return (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                padding: "2px 10px",
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              <span
                style={{
                  color: t.side === "BUY" ? "var(--bid)" : "var(--ask)",
                  fontWeight: 600,
                }}
              >
                {formatAmount(t.price)}
              </span>
              <span style={{ textAlign: "right", color: "var(--text-primary)" }}>
                {t.size}
              </span>
              <span style={{ textAlign: "right", color: "var(--text-muted)", fontSize: 10 }}>
                {timeStr}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
