"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatAmount, formatCompact } from "@sisera/ui";
import type { TelegramNewsItem, MarketAnalysis } from "@sisera/api-client";

interface PairIntelligenceDockProps {
  symbol: string;
  positionsSlot: React.ReactNode;
}

export function PairIntelligenceDock({ symbol, positionsSlot }: PairIntelligenceDockProps) {
  const [activeTab, setActiveTab] = useState<"positions" | "technical" | "microstructure" | "macro" | "news">("positions");

  const analysisQuery = useQuery<MarketAnalysis>({
    queryKey: ["analysis", symbol],
    queryFn: () => api.getAnalysis(symbol),
    refetchInterval: 5000,
  });

  const newsQuery = useQuery<TelegramNewsItem[]>({
    queryKey: ["news", symbol],
    queryFn: () => api.getNews(symbol, 20),
    refetchInterval: 10000,
  });

  const analysis = analysisQuery.data;
  const news = newsQuery.data || [];

  const verdict = analysis?.verdict || "ANALYZING";
  const compositeScore = analysis?.composite_score ?? 0;
  const isBullish = compositeScore > 10;
  const isBearish = compositeScore < -10;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-panel)", overflow: "hidden" }}>
      {/* Top Tab Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          height: 32,
          minHeight: 32,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => setActiveTab("positions")}
            className={`tab-btn ${activeTab === "positions" ? "active" : ""}`}
            style={{ fontSize: 10, padding: "4px 8px" }}
          >
            Positions & Orders
          </button>
          <button
            onClick={() => setActiveTab("technical")}
            className={`tab-btn ${activeTab === "technical" ? "active" : ""}`}
            style={{ fontSize: 10, padding: "4px 8px" }}
          >
            Technical TA
          </button>
          <button
            onClick={() => setActiveTab("microstructure")}
            className={`tab-btn ${activeTab === "microstructure" ? "active" : ""}`}
            style={{ fontSize: 10, padding: "4px 8px" }}
          >
            Microstructure & Perp
          </button>
          <button
            onClick={() => setActiveTab("macro")}
            className={`tab-btn ${activeTab === "macro" ? "active" : ""}`}
            style={{ fontSize: 10, padding: "4px 8px" }}
          >
            Macro Regime
          </button>
          <button
            onClick={() => setActiveTab("news")}
            className={`tab-btn ${activeTab === "news" ? "active" : ""}`}
            style={{ fontSize: 10, padding: "4px 8px" }}
          >
            Telegram News ({news.length})
          </button>
        </div>

        {/* Quant Verdict Pill */}
        {analysis && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
              SCORE: {compositeScore > 0 ? `+${compositeScore}` : compositeScore}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "monospace",
                padding: "2px 6px",
                borderRadius: 3,
                background: isBullish ? "rgba(16, 185, 129, 0.15)" : isBearish ? "rgba(244, 63, 94, 0.15)" : "rgba(255, 255, 255, 0.05)",
                color: isBullish ? "var(--bid)" : isBearish ? "var(--ask)" : "var(--text-secondary)",
                border: isBullish ? "1px solid rgba(16, 185, 129, 0.3)" : isBearish ? "1px solid rgba(244, 63, 94, 0.3)" : "1px solid var(--border)",
              }}
            >
              {verdict}
            </span>
          </div>
        )}
      </div>

      {/* Dock Content Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab === "positions" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            {positionsSlot}
          </div>
        )}

        {activeTab === "technical" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {analysis?.technicals ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                {/* 1. Oscillators / RSI */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>RSI (14)</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, background: "rgba(6, 182, 212, 0.15)", color: "#06b6d4" }}>
                      {analysis.technicals.rsi.condition}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary)" }}>
                      {analysis.technicals.rsi.value}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>/ 100</span>
                  </div>
                  <div style={{ width: "100%", height: 4, background: "var(--bg-panel)", borderRadius: 2, margin: "8px 0 6px 0", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, analysis.technicals.rsi.value))}%`, height: "100%", background: analysis.technicals.rsi.value >= 70 ? "var(--ask)" : analysis.technicals.rsi.value <= 30 ? "var(--bid)" : "#06b6d4" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                    Signal: <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{analysis.technicals.rsi.signal}</span>
                  </div>
                </div>

                {/* 2. MACD */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>MACD (12, 26, 9)</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, background: analysis.technicals.macd.histogram >= 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)", color: analysis.technicals.macd.histogram >= 0 ? "var(--bid)" : "var(--ask)" }}>
                      {analysis.technicals.macd.trend}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "monospace" }}>
                    <div>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>HIST: </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: analysis.technicals.macd.histogram >= 0 ? "var(--bid)" : "var(--ask)" }}>
                        {analysis.technicals.macd.histogram > 0 ? `+${analysis.technicals.macd.histogram}` : analysis.technicals.macd.histogram}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                    <span>MACD: {analysis.technicals.macd.macd}</span>
                    <span>SIGNAL: {analysis.technicals.macd.signal}</span>
                  </div>
                </div>

                {/* 3. Moving Averages / EMAs */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>EMA Alignment</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
                      {analysis.technicals.emas.alignment}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontFamily: "monospace" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#06b6d4" }}>EMA 20:</span>
                      <span style={{ fontWeight: 600 }}>${formatAmount(analysis.technicals.emas.ema_20)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#f59e0b" }}>EMA 50:</span>
                      <span style={{ fontWeight: 600 }}>${formatAmount(analysis.technicals.emas.ema_50)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>EMA 200:</span>
                      <span style={{ fontWeight: 600 }}>${formatAmount(analysis.technicals.emas.ema_200)}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Bollinger Bands & Volatility */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Bollinger & ATR</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, background: "rgba(168, 85, 247, 0.15)", color: "#a855f7" }}>
                      {analysis.technicals.atr.volatility_regime}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace" }}>
                    <span style={{ color: "var(--text-muted)" }}>ATR (14):</span>
                    <span style={{ fontWeight: 600 }}>${analysis.technicals.atr.value} ({analysis.technicals.atr.atr_pct}%)</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace", marginTop: 4 }}>
                    <span style={{ color: "var(--text-muted)" }}>Bandwidth:</span>
                    <span style={{ fontWeight: 600 }}>{analysis.technicals.bollinger.bandwidth_pct}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace", marginTop: 4 }}>
                    <span style={{ color: "var(--text-muted)" }}>%b Position:</span>
                    <span style={{ fontWeight: 600 }}>{analysis.technicals.bollinger.pct_b}</span>
                  </div>
                </div>

                {/* 5. Execution Pivots (S1/S2/R1/R2) */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10, gridColumn: "span 2" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Intraday Floor Trader Pivots</span>
                    <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>PIVOT: ${formatAmount(analysis.technicals.pivots.pivot)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, fontSize: 10, fontFamily: "monospace" }}>
                    <div style={{ padding: "4px 6px", background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.2)", borderRadius: 3 }}>
                      <div style={{ color: "var(--ask)", fontWeight: 700, fontSize: 9 }}>RESISTANCE 2</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>${formatAmount(analysis.technicals.pivots.r2)}</div>
                    </div>
                    <div style={{ padding: "4px 6px", background: "rgba(244, 63, 94, 0.04)", border: "1px solid rgba(244, 63, 94, 0.15)", borderRadius: 3 }}>
                      <div style={{ color: "var(--ask)", fontWeight: 700, fontSize: 9 }}>RESISTANCE 1</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>${formatAmount(analysis.technicals.pivots.r1)}</div>
                    </div>
                    <div style={{ padding: "4px 6px", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: 3 }}>
                      <div style={{ color: "var(--bid)", fontWeight: 700, fontSize: 9 }}>SUPPORT 1</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>${formatAmount(analysis.technicals.pivots.s1)}</div>
                    </div>
                    <div style={{ padding: "4px 6px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 3 }}>
                      <div style={{ color: "var(--bid)", fontWeight: 700, fontSize: 9 }}>SUPPORT 2</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>${formatAmount(analysis.technicals.pivots.s2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Calculating real-time technical indicators from live candle feed...</div>
            )}
          </div>
        )}

        {activeTab === "microstructure" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {analysis?.microstructure ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
                {/* 1. Order Book Imbalance */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>L2 Book Imbalance</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, background: "rgba(6, 182, 212, 0.15)", color: "#06b6d4" }}>
                      {analysis.microstructure.imbalance_status}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: "var(--text-primary)" }}>
                    {analysis.microstructure.order_book_imbalance > 0 ? `+${analysis.microstructure.order_book_imbalance}` : analysis.microstructure.order_book_imbalance}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, fontFamily: "monospace" }}>
                    <span style={{ color: "var(--bid)" }}>Bid Depth (top 15): {analysis.microstructure.bid_depth_top15}</span>
                    <span style={{ color: "var(--ask)" }}>Ask Depth: {analysis.microstructure.ask_depth_top15}</span>
                  </div>
                </div>

                {/* 2. Funding APR & Open Interest */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Perp Funding Rate</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, background: "rgba(16, 185, 129, 0.15)", color: "var(--bid)" }}>
                      8H INTERVAL
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "monospace" }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "var(--bid)" }}>
                      {(analysis.microstructure.funding_rate * 100).toFixed(4)}%
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      (APR: {analysis.microstructure.annualized_funding_apr_pct}%)
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                    OPEN INTEREST: <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{analysis.microstructure.open_interest}</span>
                  </div>
                </div>

                {/* 3. Smart Money Divergence */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10, gridColumn: "span 2" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Smart-Money Accumulation Divergence</span>
                    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "monospace", color: "#38bdf8" }}>
                      SCORE: {analysis.microstructure.smart_money_divergence.score}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {analysis.microstructure.smart_money_divergence.interpretation}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                    <span>24h Long Liquidations: <strong style={{ color: "var(--ask)" }}>{analysis.microstructure.liquidations_24h.long_usd}</strong></span>
                    <span>Short Liquidations: <strong style={{ color: "var(--bid)" }}>{analysis.microstructure.liquidations_24h.short_usd}</strong></span>
                    <span>Bias: <strong style={{ color: "var(--text-primary)" }}>{analysis.microstructure.liquidations_24h.net_bias}</strong></span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Fetching live derivatives microstructure...</div>
            )}
          </div>
        )}

        {activeTab === "macro" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {analysis?.macro ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                {/* 1. Macro Regime */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Macro Regime</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: analysis.macro.macro_regime === "RISK_ON" ? "var(--bid)" : "#f59e0b", fontFamily: "monospace" }}>
                    {analysis.macro.macro_regime}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                    Composite Score: <span className="font-mono" style={{ color: "var(--text-primary)" }}>{analysis.macro.regime_score}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
                    {analysis.macro.fed_posture}
                  </div>
                </div>

                {/* 2. Rates & Yields */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Rates & Yields</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, fontFamily: "monospace" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>Fed Funds Rate:</span>
                      <span style={{ fontWeight: 700 }}>{analysis.macro.fed_funds_rate}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>US 10Y Yield:</span>
                      <span style={{ fontWeight: 700 }}>{analysis.macro.us10y_yield}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>CPI (YoY):</span>
                      <span style={{ fontWeight: 700 }}>{analysis.macro.cpi_yoy}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>DXY Dollar Index:</span>
                      <span style={{ fontWeight: 700 }}>{analysis.macro.dxy_dollar_index}</span>
                    </div>
                  </div>
                </div>

                {/* 3. DeFi & Crypto Liquidity */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Global Crypto Liquidity</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, fontFamily: "monospace" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>DeFi TVL:</span>
                      <span style={{ fontWeight: 700, color: "var(--bid)" }}>{analysis.macro.defi_tvl_usd} ({analysis.macro.defi_tvl_7d_change})</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>BTC Dominance:</span>
                      <span style={{ fontWeight: 700 }}>{analysis.macro.btc_dominance}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>Liquidity State:</span>
                      <span style={{ fontWeight: 700, color: "#38bdf8" }}>{analysis.macro.global_liquidity_state}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Upcoming Catalysts */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Key Macro Catalyst</div>
                  <div style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 600, lineHeight: 1.4 }}>
                    {analysis.macro.key_event_catalyst}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                    Recommendation: <strong style={{ color: "#06b6d4" }}>{analysis.action_recommendation}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Loading macro backdrop & rates...</div>
            )}
          </div>
        )}

        {activeTab === "news" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
            {news.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>
                Connecting to Telegram public channel feed (@WatcherGuru, @cointelegraph)...
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {news.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 2, background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}>
                          @{item.channel}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: 2,
                            background: item.sentiment === "BULLISH" ? "rgba(16, 185, 129, 0.15)" : item.sentiment === "BEARISH" ? "rgba(244, 63, 94, 0.15)" : "rgba(255, 255, 255, 0.05)",
                            color: item.sentiment === "BULLISH" ? "var(--bid)" : item.sentiment === "BEARISH" ? "var(--ask)" : "var(--text-muted)",
                          }}
                        >
                          {item.sentiment}
                        </span>
                        {item.symbols?.map((sym) => (
                          <span key={sym} style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
                            #{sym}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
                          {new Date(item.timestamp_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 9, color: "var(--accent)", textDecoration: "none" }}
                        >
                          Telegram ↗
                        </a>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.4 }}>
                      {item.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
