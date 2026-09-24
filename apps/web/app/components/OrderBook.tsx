"use client";

import { useMemo } from "react";
import type { OrderBook } from "@sisera/api-client";
import { formatAmount } from "@sisera/ui";

interface OrderBookProps {
  orderBook: OrderBook | null;
  lastPrice: string;
  onSelectPrice: (price: string) => void;
}

export function OrderBookView({ orderBook, lastPrice, onSelectPrice }: OrderBookProps) {
  const { bidsWithDepth, asksWithDepth, spread, spreadBps } = useMemo(() => {
    const mid = Number(lastPrice) || 64250.0;
    const rawAsks = orderBook?.asks?.length
      ? orderBook.asks
      : Array.from({ length: 10 }, (_, i) => ({
          price: (mid + (i + 1) * 2).toFixed(2),
          size: ((i + 1) * 0.42 + 0.1).toFixed(3),
        }));

    const rawBids = orderBook?.bids?.length
      ? orderBook.bids
      : Array.from({ length: 10 }, (_, i) => ({
          price: (mid - (i + 1) * 2).toFixed(2),
          size: ((i + 1) * 0.45 + 0.1).toFixed(3),
        }));

    // Compute cumulative totals for asks
    let runningAskTotal = 0;
    const asksSorted = [...rawAsks].slice(0, 10);
    const asksWithDepth = asksSorted.map((a) => {
      const size = Number(a.size);
      runningAskTotal += size;
      return { ...a, cumulative: runningAskTotal };
    });

    // Compute cumulative totals for bids
    let runningBidTotal = 0;
    const bidsSorted = [...rawBids].slice(0, 10);
    const bidsWithDepth = bidsSorted.map((b) => {
      const size = Number(b.size);
      runningBidTotal += size;
      return { ...b, cumulative: runningBidTotal };
    });

    const maxAsk = runningAskTotal || 1;
    const maxBid = runningBidTotal || 1;
    const maxTotal = Math.max(maxAsk, maxBid);

    const asks = asksWithDepth
      .map((a) => ({
        ...a,
        depthPct: Math.min(100, (a.cumulative / maxTotal) * 100),
      }))
      .reverse(); // Lowest ask closest to spread

    const bids = bidsWithDepth.map((b) => ({
      ...b,
      depthPct: Math.min(100, (b.cumulative / maxTotal) * 100),
    }));

    // Calculate spread
    const topBid = bidsSorted[0]?.price ? Number(bidsSorted[0].price) : mid - 2;
    const topAsk = asksSorted[0]?.price ? Number(asksSorted[0].price) : mid + 2;
    const sp = topAsk && topBid ? topAsk - topBid : 4.0;
    const spBps = topBid > 0 ? ((sp / topBid) * 10000).toFixed(1) : "0.6";

    return {
      bidsWithDepth: bids,
      asksWithDepth: asks,
      spread: sp > 0 ? sp.toFixed(2) : "4.00",
      spreadBps: spBps,
    };
  }, [orderBook, lastPrice]);

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
        <span style={{ textAlign: "right" }}>Total</span>
      </div>

      {/* Asks (Sells) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden" }}>
        {asksWithDepth.map((a, idx) => (
          <div
            key={idx}
            onClick={() => onSelectPrice(a.price)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              padding: "2px 10px",
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              cursor: "pointer",
              position: "relative",
              userSelect: "none",
            }}
          >
            {/* Depth bar fill */}
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: `${a.depthPct}%`,
                background: "rgba(244, 63, 94, 0.12)",
                zIndex: 0,
                pointerEvents: "none",
              }}
            />
            <span style={{ color: "var(--ask)", fontWeight: 600, zIndex: 1 }}>
              {formatAmount(a.price)}
            </span>
            <span style={{ textAlign: "right", color: "var(--text-primary)", zIndex: 1 }}>
              {formatAmount(a.size, 3)}
            </span>
            <span style={{ textAlign: "right", color: "var(--text-muted)", zIndex: 1 }}>
              {formatAmount(a.cumulative, 3)}
            </span>
          </div>
        ))}
      </div>

      {/* Spread Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 10px",
          background: "var(--bg-panel)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          fontWeight: 700,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--text-primary)", fontSize: 13 }}>
            ${formatAmount(lastPrice)}
          </span>
        </div>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
          Spread: ${spread} ({spreadBps} bps)
        </span>
      </div>

      {/* Bids (Buys) */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {bidsWithDepth.map((b, idx) => (
          <div
            key={idx}
            onClick={() => onSelectPrice(b.price)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              padding: "2px 10px",
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              cursor: "pointer",
              position: "relative",
              userSelect: "none",
            }}
          >
            {/* Depth bar fill */}
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: `${b.depthPct}%`,
                background: "rgba(16, 185, 129, 0.12)",
                zIndex: 0,
                pointerEvents: "none",
              }}
            />
            <span style={{ color: "var(--bid)", fontWeight: 600, zIndex: 1 }}>
              {formatAmount(b.price)}
            </span>
            <span style={{ textAlign: "right", color: "var(--text-primary)", zIndex: 1 }}>
              {formatAmount(b.size, 3)}
            </span>
            <span style={{ textAlign: "right", color: "var(--text-muted)", zIndex: 1 }}>
              {formatAmount(b.cumulative, 3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
