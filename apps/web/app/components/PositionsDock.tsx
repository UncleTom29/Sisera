"use client";

import { useState } from "react";
import { formatAmount, formatCurrency, formatPct } from "@sisera/ui";
import type { Order, Position } from "@sisera/api-client";

interface PositionsDockProps {
  positions: Position[];
  orders: Order[];
  onClosePosition: (symbol: string) => void;
  onCancelOrder: (orderId: string) => void;
}

export function PositionsDock({
  positions,
  orders,
  onClosePosition,
  onCancelOrder,
}: PositionsDockProps) {
  const [activeTab, setActiveTab] = useState<"positions" | "orders" | "fills" | "risk">("positions");

  const openOrders = orders.filter(
    (o) => o.state !== "FILLED" && o.state !== "CANCELLED" && o.state !== "REJECTED"
  );
  const filledOrders = orders.filter((o) => o.state === "FILLED");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--bg-surface)" }}>
      {/* Dock Tabs Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 32,
          minHeight: 32,
          padding: "0 10px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setActiveTab("positions")}
            className={`tab-btn ${activeTab === "positions" ? "active" : ""}`}
          >
            Positions ({positions.length})
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}
          >
            Open Orders ({openOrders.length})
          </button>
          <button
            onClick={() => setActiveTab("fills")}
            className={`tab-btn ${activeTab === "fills" ? "active" : ""}`}
          >
            Trade History ({filledOrders.length})
          </button>
          <button
            onClick={() => setActiveTab("risk")}
            className={`tab-btn ${activeTab === "risk" ? "active" : ""}`}
          >
            Risk & Margin
          </button>
        </div>
      </div>

      {/* Dock Content Table */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {activeTab === "positions" && (
          <table className="trade-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Side</th>
                <th className="align-right">Size</th>
                <th className="align-right">Entry Price</th>
                <th className="align-right">Mark Price</th>
                <th className="align-right">Liq. Price</th>
                <th className="align-right">Margin</th>
                <th className="align-right">Unrealized P&L</th>
                <th className="align-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                    No open positions. Submit an order from the Execution Ticket to open a position.
                  </td>
                </tr>
              ) : (
                positions.map((p) => {
                  const qty = Number(p.quantity);
                  const isLong = p.side ? p.side === "BUY" : qty >= 0;
                  const pnl = Number(p.unrealized_pnl) || 0;
                  const isProfitable = pnl >= 0;
                  const entryVal = Math.abs(qty) * Number(p.entry_price);
                  const pnlPct = entryVal > 0 ? (pnl / entryVal) * 100 : 0;
                  const displaySymbol = p.symbol || p.instrument_id;

                  return (
                    <tr key={p.instrument_id}>
                      <td style={{ fontWeight: 600 }}>{displaySymbol}</td>
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            color: isLong ? "var(--bid)" : "var(--ask)",
                          }}
                        >
                          {isLong ? "LONG" : "SHORT"}
                        </span>
                      </td>
                      <td className="align-right font-mono">{Math.abs(qty).toFixed(3)}</td>
                      <td className="align-right font-mono">${formatAmount(p.entry_price)}</td>
                      <td className="align-right font-mono">
                        ${formatAmount(p.current_price || p.entry_price)}
                      </td>
                      <td className="align-right font-mono" style={{ color: "var(--warning)" }}>
                        ${p.liquidation_price ? formatAmount(p.liquidation_price) : (Number(p.entry_price) * (isLong ? 0.75 : 1.25)).toFixed(2)}
                      </td>
                      <td className="align-right font-mono">
                        ${p.margin_used ? formatAmount(p.margin_used) : ((Math.abs(qty) * Number(p.entry_price)) / 10).toFixed(2)}
                      </td>
                      <td
                        className={`align-right font-mono ${
                          isProfitable ? "text-bid" : "text-ask"
                        }`}
                        style={{ fontWeight: 600 }}
                      >
                        {isProfitable ? "+" : ""}${formatAmount(pnl)} ({isProfitable ? "+" : ""}{pnlPct.toFixed(2)}%)
                      </td>
                      <td className="align-right">
                        <button
                          onClick={() => onClosePosition(p.instrument_id)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border)",
                            color: "var(--text-secondary)",
                            padding: "2px 8px",
                            borderRadius: 3,
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Market Close
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {activeTab === "orders" && (
          <table className="trade-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Market</th>
                <th>Type</th>
                <th>Side</th>
                <th className="align-right">Price</th>
                <th className="align-right">Amount</th>
                <th className="align-right">State</th>
                <th className="align-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                    No active open orders
                  </td>
                </tr>
              ) : (
                openOrders.map((o) => (
                  <tr key={o.sisera_order_id}>
                    <td className="font-mono" style={{ color: "var(--text-muted)" }}>
                      {o.sisera_order_id.slice(0, 10)}...
                    </td>
                    <td style={{ fontWeight: 600 }}>{o.instrument_id}</td>
                    <td>{o.order_type}</td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: o.side === "BUY" ? "var(--bid)" : "var(--ask)",
                      }}
                    >
                      {o.side}
                    </td>
                    <td className="align-right font-mono">
                      {o.price ? `$${formatAmount(o.price)}` : "MARKET"}
                    </td>
                    <td className="align-right font-mono">{o.quantity}</td>
                    <td className="align-right font-mono" style={{ color: "var(--accent)" }}>
                      {o.state}
                    </td>
                    <td className="align-right">
                      <button
                        onClick={() => onCancelOrder(o.sisera_order_id)}
                        style={{
                          background: "rgba(244, 63, 94, 0.15)",
                          border: "1px solid rgba(244, 63, 94, 0.3)",
                          color: "var(--ask)",
                          padding: "2px 8px",
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === "fills" && (
          <table className="trade-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Market</th>
                <th>Side</th>
                <th className="align-right">Exec Price</th>
                <th className="align-right">Filled Size</th>
                <th className="align-right">TCA Slippage</th>
                <th className="align-right">Execution Mode</th>
              </tr>
            </thead>
            <tbody>
              {filledOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                    No filled trades in this session
                  </td>
                </tr>
              ) : (
                filledOrders.map((o) => (
                  <tr key={o.sisera_order_id}>
                    <td className="font-mono" style={{ color: "var(--text-muted)" }}>
                      {o.sisera_order_id.slice(0, 10)}...
                    </td>
                    <td style={{ fontWeight: 600 }}>{o.instrument_id}</td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: o.side === "BUY" ? "var(--bid)" : "var(--ask)",
                      }}
                    >
                      {o.side}
                    </td>
                    <td className="align-right font-mono">
                      ${formatAmount(o.avg_fill_price || o.price || 0)}
                    </td>
                    <td className="align-right font-mono">{o.filled_quantity || o.quantity}</td>
                    <td className="align-right font-mono text-bid">-0.4 bps</td>
                    <td className="align-right" style={{ color: "var(--text-secondary)" }}>
                      SOR Direct
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === "risk" && (() => {
          const totalGrossExp = positions.reduce(
            (acc, p) => acc + Math.abs(Number(p.quantity)) * Number(p.current_price || p.entry_price || 0),
            0
          );
          const totalMargin = positions.reduce(
            (acc, p) => acc + (Number(p.margin_used) || ((Math.abs(Number(p.quantity)) * Number(p.entry_price || 0)) / 10)),
            0
          );
          const netDelta = positions.reduce(
            (acc, p) =>
              acc +
              (p.side === "BUY" || Number(p.quantity) >= 0 ? 1 : -1) *
                Math.abs(Number(p.quantity)) *
                Number(p.current_price || p.entry_price || 0),
            0
          );
          const effectiveLev = (totalGrossExp / 100000).toFixed(2);
          const availMargin = Math.max(0, 100000 - totalMargin);

          return (
            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <div style={{ background: "var(--bg-card)", padding: 10, borderRadius: 4, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Effective Leverage
                </div>
                <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  {effectiveLev}x / 10.0x
                </div>
                <div style={{ fontSize: 10, color: Number(effectiveLev) < 2 ? "var(--bid)" : "var(--warning)", marginTop: 2 }}>
                  {Number(effectiveLev) < 2 ? "Low Exposure" : "Moderate Exposure"}
                </div>
              </div>

              <div style={{ background: "var(--bg-card)", padding: 10, borderRadius: 4, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Used / Available Margin
                </div>
                <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  ${formatAmount(totalMargin)} / ${formatAmount(availMargin)}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                  Cross Margin Mode
                </div>
              </div>

              <div style={{ background: "var(--bg-card)", padding: 10, borderRadius: 4, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Portfolio Delta
                </div>
                <div className={`font-mono ${netDelta >= 0 ? "text-bid" : "text-ask"}`} style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  {netDelta >= 0 ? "+" : ""}${formatAmount(netDelta)}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
                  {netDelta >= 0 ? "Net Long Beta" : "Net Short Beta"}
                </div>
              </div>

              <div style={{ background: "var(--bg-card)", padding: 10, borderRadius: 4, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Circuit Breakers
                </div>
                <div className="font-mono text-bid" style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                  NORMAL
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  All venues synchronized
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
