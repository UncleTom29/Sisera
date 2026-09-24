"use client";

import { useEffect, useState } from "react";
import { formatAmount, formatCurrency } from "@sisera/ui";
import type { OrderPreviewResponse, OrderSide, OrderType } from "@sisera/api-client";

interface TradeTicketProps {
  symbol: string;
  lastPrice: string;
  availableBalance: string;
  preview: OrderPreviewResponse | undefined;
  isLoadingPreview: boolean;
  isSubmitting: boolean;
  onSubmit: (params: {
    side: OrderSide;
    orderType: OrderType;
    quantity: string;
    price?: string;
  }) => void;
  selectedPrice?: string;
}

export function TradeTicket({
  symbol,
  lastPrice,
  availableBalance,
  preview,
  isLoadingPreview,
  isSubmitting,
  onSubmit,
  selectedPrice,
}: TradeTicketProps) {
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [price, setPrice] = useState<string>(lastPrice);
  const [size, setSize] = useState<string>("0.25");
  const [leverage, setLeverage] = useState<string>("10x");

  // If user clicks a price in the order book, update the limit price
  useEffect(() => {
    if (selectedPrice) {
      setPrice(selectedPrice);
      setOrderType("LIMIT");
    }
  }, [selectedPrice]);

  // When lastPrice changes and price was not custom edited, sync
  useEffect(() => {
    if (!price || price === "0") {
      setPrice(lastPrice);
    }
  }, [lastPrice]);

  const handlePercentageSize = (pct: number) => {
    const curPrice = Number(lastPrice) || 83000;
    const targetNotional = (Number(availableBalance) || 100000) * (pct / 100) * 0.25;
    const precision = curPrice > 1000 ? 3 : curPrice > 10 ? 2 : 1;
    const calc = Math.max(0.001, Number((targetNotional / curPrice).toFixed(precision))).toString();
    setSize(calc);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!size || Number(size) <= 0) return;
    onSubmit({
      side,
      orderType,
      quantity: size,
      price: orderType === "LIMIT" ? price : undefined,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      {/* Ticket Header Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
          ORDER TICKET
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            <option value="1x">Cross 1x</option>
            <option value="3x">Cross 3x</option>
            <option value="5x">Cross 5x</option>
            <option value="10x">Cross 10x</option>
            <option value="20x">Cross 20x</option>
          </select>
        </div>
      </div>

      <form
        onSubmit={handleFormSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: 12,
          gap: 10,
          overflowY: "auto",
        }}
      >
        {/* Buy / Long vs Sell / Short Toggle */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <button
            type="button"
            onClick={() => setSide("BUY")}
            style={{
              padding: "8px 0",
              borderRadius: 4,
              border: "none",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.1s ease",
              background: side === "BUY" ? "var(--bid)" : "var(--bg-card)",
              color: side === "BUY" ? "#041a10" : "var(--text-secondary)",
            }}
          >
            BUY / LONG
          </button>
          <button
            type="button"
            onClick={() => setSide("SELL")}
            style={{
              padding: "8px 0",
              borderRadius: 4,
              border: "none",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.1s ease",
              background: side === "SELL" ? "var(--ask)" : "var(--bg-card)",
              color: side === "SELL" ? "#ffffff" : "var(--text-secondary)",
            }}
          >
            SELL / SHORT
          </button>
        </div>

        {/* Order Type Toggle */}
        <div style={{ display: "flex", gap: 4, background: "var(--bg-card)", padding: 2, borderRadius: 4 }}>
          {(["LIMIT", "MARKET", "STOP"] as OrderType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOrderType(type)}
              style={{
                flex: 1,
                padding: "5px 0",
                border: "none",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                background: orderType === type ? "var(--bg-active)" : "transparent",
                color: orderType === type ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Limit Price Input */}
        {orderType === "LIMIT" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
                PRICE (USD)
              </span>
              <button
                type="button"
                onClick={() => setPrice(lastPrice)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 10,
                  color: "var(--accent)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Mid (${formatAmount(lastPrice)})
              </button>
            </div>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input-field font-mono"
              placeholder="0.00"
            />
          </div>
        )}

        {/* Order Size Input */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
              SIZE ({symbol.split("-")[0] || "BTC"})
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              Avail: ${formatAmount(availableBalance)}
            </span>
          </div>
          <input
            type="text"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="input-field font-mono"
            placeholder="0.00"
          />
        </div>

        {/* Quick Size Percentage Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => handlePercentageSize(pct)}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 0",
                cursor: "pointer",
              }}
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Pre-Trade Execution & Risk Preview (Clean Institutional Data) */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: 8,
            fontSize: 11,
            marginTop: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            <span>Pre-Trade Execution</span>
            <span style={{ color: "var(--bid)" }}>
              {preview?.risk_check?.approved ? "Risk OK" : "Verifying"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Route</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                {preview?.route_plan?.decision || "SOR Maker-First"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Est. Slippage</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                {preview?.estimated_slippage_bps || "1.2"} bps
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Margin Required</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                ${formatAmount(preview?.margin_impact || (Number(size) * Number(price) * 0.1 || 634.2))}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Est. Notional</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                ${formatAmount(Number(size) * Number(price) || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          <button
            type="submit"
            disabled={isSubmitting || !size || Number(size) <= 0}
            className={`btn-base ${side === "BUY" ? "btn-bid" : "btn-ask"}`}
            style={{ width: "100%", padding: "10px 0", fontSize: 13, fontWeight: 700 }}
          >
            {isSubmitting
              ? "Submitting..."
              : `${side === "BUY" ? "BUY / LONG" : "SELL / SHORT"} ${size} ${symbol}`}
          </button>
        </div>
      </form>
    </div>
  );
}
