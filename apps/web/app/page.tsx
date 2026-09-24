"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useTerminal } from "../lib/store";
import { formatAmount, formatCompact, formatCurrency, formatPct } from "@sisera/ui";
import { CandlestickChart } from "./components/CandlestickChart";
import { OrderBookView } from "./components/OrderBook";
import { TradeTapeView } from "./components/TradeTape";
import { TradeTicket } from "./components/TradeTicket";
import { PositionsDock } from "./components/PositionsDock";
import { PairIntelligenceDock } from "./components/PairIntelligenceDock";
import { CopilotDrawer } from "./components/CopilotDrawer";
import type { OrderSide, OrderType } from "@sisera/api-client";

export default function TerminalPage() {
  const { symbol, setSymbol, portfolioId } = useTerminal();
  const [chartInterval, setChartInterval] = useState("1h");
  const [selectedBookPrice, setSelectedBookPrice] = useState<string | undefined>(undefined);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<"markets" | "signals">("markets");
  const [bookTab, setBookTab] = useState<"split" | "book" | "tape">("split");
  const [marketSearch, setMarketSearch] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Queries wired to API
  const marketsQuery = useQuery({
    queryKey: ["markets"],
    queryFn: () => api.listMarkets(),
    refetchInterval: 3000,
  });

  const tickerQuery = useQuery({
    queryKey: ["ticker", symbol],
    queryFn: () => api.getTicker(symbol),
    refetchInterval: 2000,
  });

  const orderBookQuery = useQuery({
    queryKey: ["orderbook", symbol],
    queryFn: () => api.getOrderBook(symbol, 12),
    refetchInterval: 1500,
  });

  const tradesQuery = useQuery({
    queryKey: ["trades", symbol],
    queryFn: () => api.getTrades(symbol, 25),
    refetchInterval: 2000,
  });

  const candlesQuery = useQuery({
    queryKey: ["candles", symbol, chartInterval],
    queryFn: () => api.getCandles(symbol, chartInterval, 60),
    refetchInterval: 10000,
  });

  const positionsQuery = useQuery({
    queryKey: ["positions", portfolioId],
    queryFn: () => api.listPositions(portfolioId),
    refetchInterval: 3000,
  });

  const ordersQuery = useQuery({
    queryKey: ["orders", portfolioId],
    queryFn: () => api.listOrders(portfolioId),
    refetchInterval: 3000,
  });

  const opportunitiesQuery = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => api.listOpportunities(),
    refetchInterval: 15000,
  });

  const portfolioQuery = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.getPortfolio(portfolioId),
    refetchInterval: 5000,
  });

  // Current ticker data
  const currentTicker = tickerQuery.data || {
    symbol: symbol || "BTCUSDT",
    last_price: "63420.50",
    change_24h_pct: "2.45",
    volume_24h: "1420500000",
    funding_rate: "0.0001",
    open_interest: "854000000",
    quality_status: "LIVE" as const,
  };

  const isUp = Number(currentTicker.change_24h_pct) >= 0;

  // Order Submission Mutation
  const orderMutation = useMutation({
    mutationFn: async (params: {
      side: OrderSide;
      orderType: OrderType;
      quantity: string;
      price?: string;
    }) => {
      const clientOrderId = `cli_${Date.now()}`;
      const created = await api.createOrder({
        client_order_id: clientOrderId,
        instrument_id: symbol,
        side: params.side,
        order_type: params.orderType,
        quantity: params.quantity,
        price: params.price,
        account_id: "desk_main",
        portfolio_id: portfolioId,
      });

      const execRes = await api.executeOrder(created.sisera_order_id, {
        portfolio_id: portfolioId,
        account_id: "desk_main",
      });
      return execRes;
    },
    onSuccess: (data) => {
      setFeedback({
        type: "success",
        text: `Filled ${data.fill.filled_quantity} ${symbol} @ $${formatAmount(data.fill.avg_fill_price)} (${data.order.sisera_order_id.slice(0, 10)})`,
      });
      positionsQuery.refetch();
      ordersQuery.refetch();
      portfolioQuery.refetch();
      setTimeout(() => setFeedback(null), 6000);
    },
    onError: (err: any) => {
      setFeedback({ type: "error", text: err.message || "Order placement rejected" });
      setTimeout(() => setFeedback(null), 6000);
    },
  });

  const closePositionMutation = useMutation({
    mutationFn: (instId: string) => api.closePosition(instId),
    onSuccess: () => {
      positionsQuery.refetch();
      ordersQuery.refetch();
      portfolioQuery.refetch();
    },
  });

  const allMarkets = marketsQuery.data || [];
  const filteredMarkets = allMarkets.filter((m) =>
    m.symbol.toLowerCase().includes(marketSearch.toLowerCase())
  );

  const opportunities = opportunitiesQuery.data || [];
  const positions = positionsQuery.data || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Market Ribbon Sub-header */}
      <div className="market-ribbon">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
              {currentTicker.symbol}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 5px",
                borderRadius: 3,
                background: "rgba(16, 185, 129, 0.15)",
                color: "var(--bid)",
              }}
            >
              PERP
            </span>
          </div>

          <span
            className="font-mono"
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: isUp ? "var(--bid)" : "var(--ask)",
            }}
          >
            ${formatAmount(currentTicker.last_price)}
          </span>
        </div>

        <div className="ribbon-stats">
          <div className="stat-item">
            <span className="stat-label">24h Change</span>
            <span
              className={`stat-value font-mono ${isUp ? "text-bid" : "text-ask"}`}
            >
              {formatPct(currentTicker.change_24h_pct)}
            </span>
          </div>

          <div className="stat-item">
            <span className="stat-label">24h Volume</span>
            <span className="stat-value font-mono">
              ${formatCompact(currentTicker.volume_24h)}
            </span>
          </div>

          <div className="stat-item">
            <span className="stat-label">Funding (8h)</span>
            <span className="stat-value font-mono text-bid">
              {(Number(currentTicker.funding_rate) * 100).toFixed(4)}%
            </span>
          </div>

          <div className="stat-item">
            <span className="stat-label">Open Interest</span>
            <span className="stat-value font-mono">
              ${formatCompact(currentTicker.open_interest)}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setCopilotOpen(true)}
            className="btn-base btn-subtle"
            style={{ fontSize: 11, padding: "5px 10px" }}
          >
            ✦ Copilot
          </button>
        </div>
      </div>

      {/* Floating feedback message */}
      {feedback && (
        <div
          style={{
            position: "absolute",
            top: 90,
            right: 20,
            zIndex: 100,
            padding: "8px 14px",
            borderRadius: 4,
            background: feedback.type === "success" ? "rgba(16, 185, 129, 0.9)" : "rgba(244, 63, 94, 0.9)",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* Main Terminal 3-Column Layout */}
      <div className="terminal-layout">
        {/* Left Column: Markets Watchlist & Opportunity Radar */}
        <div className="panel-container">
          <div className="panel-tab-header">
            <div className="tab-btn-group">
              <button
                onClick={() => setLeftTab("markets")}
                className={`tab-btn ${leftTab === "markets" ? "active" : ""}`}
              >
                Markets ({filteredMarkets.length})
              </button>
              <button
                onClick={() => setLeftTab("signals")}
                className={`tab-btn ${leftTab === "signals" ? "active" : ""}`}
              >
                Radar ({opportunities.length})
              </button>
            </div>
          </div>

          {leftTab === "markets" ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ padding: 6, borderBottom: "1px solid var(--border)" }}>
                <input
                  type="text"
                  placeholder="Search market..."
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  className="input-field"
                  style={{ fontSize: 11, padding: "4px 8px" }}
                />
              </div>

              <div className="table-wrapper">
                <table className="trade-table">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th className="align-right">Price</th>
                      <th className="align-right">24h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMarkets.map((m) => {
                      const up = Number(m.change_24h_pct) >= 0;
                      const isSelected = m.symbol === symbol;
                      return (
                        <tr
                          key={m.symbol}
                          onClick={() => setSymbol(m.symbol)}
                          style={{
                            cursor: "pointer",
                            background: isSelected ? "var(--bg-active)" : undefined,
                          }}
                        >
                          <td style={{ fontWeight: 600 }}>{m.symbol}</td>
                          <td className="align-right font-mono">${formatAmount(m.last_price)}</td>
                          <td
                            className={`align-right font-mono ${up ? "text-bid" : "text-ask"}`}
                            style={{ fontWeight: 600 }}
                          >
                            {formatPct(m.change_24h_pct)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="table-wrapper" style={{ padding: 8 }}>
              {opportunities.map((opp) => (
                <div
                  key={opp.opportunity_id}
                  onClick={() => setSymbol(opp.symbol)}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: 8,
                    marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: 11 }}>{opp.symbol}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: opp.direction === "BUY" ? "var(--bid)" : "var(--ask)",
                      }}
                    >
                      {opp.direction} · {opp.structure}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.3 }}>
                    {opp.thesis}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 6,
                      fontSize: 10,
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>Conf: {(Number(opp.confidence) * 100).toFixed(0)}%</span>
                    <span className="font-mono text-bid">EV: +{opp.expected_value}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: Center Workspace (Interactive Chart + Positions Dock) */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", borderRight: "1px solid var(--border)" }}>
          {/* Top: Interactive Candlestick Chart */}
          <div style={{ flex: "1 1 60%", minHeight: 320, borderBottom: "1px solid var(--border)" }}>
            <CandlestickChart
              symbol={symbol}
              candles={candlesQuery.data || []}
              interval={chartInterval}
              onIntervalChange={setChartInterval}
            />
          </div>

          {/* Bottom: Institutional Multi-Pillar Intelligence & Positions Dock */}
          <div style={{ flex: "1 1 40%", minHeight: 220, overflow: "hidden" }}>
            <PairIntelligenceDock
              symbol={symbol}
              positionsSlot={
                <PositionsDock
                  positions={positions}
                  orders={ordersQuery.data || []}
                  onClosePosition={(inst) => closePositionMutation.mutate(inst)}
                  onCancelOrder={() => {}}
                />
              }
            />
          </div>
        </div>

        {/* Column 3: Dedicated Order Book & Recent Trades Tape */}
        <div className="panel-container" style={{ borderRight: "1px solid var(--border)" }}>
          <div className="panel-tab-header">
            <div className="tab-btn-group">
              <button
                onClick={() => setBookTab("split")}
                className={`tab-btn ${bookTab === "split" ? "active" : ""}`}
              >
                Split
              </button>
              <button
                onClick={() => setBookTab("book")}
                className={`tab-btn ${bookTab === "book" ? "active" : ""}`}
              >
                Book (L2)
              </button>
              <button
                onClick={() => setBookTab("tape")}
                className={`tab-btn ${bookTab === "tape" ? "active" : ""}`}
              >
                Trades
              </button>
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
              {currentTicker.quality_status || "LIVE"}
            </span>
          </div>

          {bookTab === "split" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              <div style={{ flex: "1 1 58%", minHeight: 220, borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
                <OrderBookView
                  orderBook={orderBookQuery.data || null}
                  lastPrice={currentTicker.last_price}
                  onSelectPrice={setSelectedBookPrice}
                />
              </div>
              <div style={{ flex: "1 1 42%", minHeight: 160, overflow: "hidden" }}>
                <TradeTapeView lastPrice={currentTicker.last_price} symbol={symbol} trades={tradesQuery.data} />
              </div>
            </div>
          )}

          {bookTab === "book" && (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <OrderBookView
                orderBook={orderBookQuery.data || null}
                lastPrice={currentTicker.last_price}
                onSelectPrice={setSelectedBookPrice}
              />
            </div>
          )}

          {bookTab === "tape" && (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <TradeTapeView lastPrice={currentTicker.last_price} symbol={symbol} trades={tradesQuery.data} />
            </div>
          )}
        </div>

        {/* Column 4: Unified Order Entry Ticket */}
        <div className="panel-container right-panel">
          <TradeTicket
            symbol={symbol}
            lastPrice={currentTicker.last_price}
            availableBalance={typeof portfolioQuery.data?.cash === "string" ? portfolioQuery.data.cash : "95240.00"}
            preview={undefined}
            isLoadingPreview={false}
            isSubmitting={orderMutation.isPending}
            onSubmit={(params) => orderMutation.mutate(params)}
            selectedPrice={selectedBookPrice}
          />
        </div>
      </div>

      {/* Copilot Drawer */}
      <CopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        onQueryCopilot={(q) => api.queryCopilot(q, symbol, portfolioId)}
        onCompileIntent={(p) => api.compileIntent(p, portfolioId)}
        onExecutePlan={async (plan) => {
          const ord = await api.createOrder({
            client_order_id: `cop_${Date.now()}`,
            instrument_id: plan.instrument || symbol,
            side: plan.side || "SELL",
            order_type: "MARKET",
            quantity: plan.quantity || "0.25",
            account_id: "desk_main",
            portfolio_id: portfolioId,
          });
          return api.executeOrder(ord.sisera_order_id, {
            portfolio_id: portfolioId,
            account_id: "desk_main",
          });
        }}
      />
    </div>
  );
}
