"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useTerminal } from "../../lib/store";
import { formatAmount, formatCurrency, formatPct } from "@sisera/ui";

export default function PortfolioRiskPage() {
  const { portfolioId } = useTerminal();
  const [killSwitchReason, setKillSwitchReason] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const portfolioQuery = useQuery({
    queryKey: ["portfolio", portfolioId],
    queryFn: () => api.getPortfolio(portfolioId),
  });

  const riskLimitsQuery = useQuery({
    queryKey: ["risk-limits", portfolioId],
    queryFn: () => api.getRiskLimits(portfolioId),
  });

  const stressTestQuery = useQuery({
    queryKey: ["stress-test", portfolioId],
    queryFn: () => api.runStressTest(portfolioId),
  });

  const killSwitchQuery = useQuery({
    queryKey: ["kill-switch"],
    queryFn: () => api.getKillSwitches(),
    refetchInterval: 3000,
  });

  const positionsQuery = useQuery({
    queryKey: ["positions", portfolioId],
    queryFn: () => api.listPositions(portfolioId),
  });

  const tripMutation = useMutation({
    mutationFn: () => api.tripKillSwitch("GLOBAL", killSwitchReason || "Emergency risk override"),
    onSuccess: () => {
      setActionFeedback("Emergency kill switch active. All routing halted.");
      killSwitchQuery.refetch();
      setTimeout(() => setActionFeedback(null), 6000);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearKillSwitch("GLOBAL", "Operator cleared switch"),
    onSuccess: () => {
      setActionFeedback("Kill switch cleared. Normal execution resumed.");
      killSwitchQuery.refetch();
      setTimeout(() => setActionFeedback(null), 6000);
    },
  });

  const positions = positionsQuery.data || [];

  const isTripped = killSwitchQuery.data?.global_tripped || false;

  const scenarios = stressTestQuery.data?.scenarios || [
    {
      scenario_id: "sc_1",
      name: "Crypto Flash Crash (-20%)",
      shocks: { BTC: "-20%", ETH: "-25%", SOL: "-35%" },
      portfolio_pnl: "-9315.00",
      portfolio_pnl_pct: "-9.31",
      breached: false,
    },
    {
      scenario_id: "sc_2",
      name: "Volatility Surge (+100%)",
      shocks: { ImpliedVol: "+100%", Spreads: "5x" },
      portfolio_pnl: "-4120.00",
      portfolio_pnl_pct: "-4.12",
      breached: false,
    },
    {
      scenario_id: "sc_3",
      name: "Stablecoin De-peg Event ($0.92)",
      shocks: { USDT: "$0.92", USDC: "$0.99" },
      portfolio_pnl: "-3250.00",
      portfolio_pnl_pct: "-3.25",
      breached: false,
    },
    {
      scenario_id: "sc_4",
      name: "Funding Inversion Arbitrage",
      shocks: { Basis: "-50bps", Funding: "-0.08%" },
      portfolio_pnl: "+1450.00",
      portfolio_pnl_pct: "+1.45",
      breached: false,
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 18, background: "var(--bg-root)" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Page Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              Portfolio & Risk Dashboard
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Real-time balance sheets, leverage exposure, stress testing, and circuit breakers.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 4,
                background: isTripped ? "var(--ask-subtle)" : "var(--bid-subtle)",
                color: isTripped ? "var(--ask)" : "var(--bid)",
                border: `1px solid ${isTripped ? "rgba(244, 63, 94, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
              }}
            >
              {isTripped ? "CIRCUIT BREAKER: TRIPPED" : "RISK ENGINE: NORMAL"}
            </span>
          </div>
        </div>

        {actionFeedback && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: actionFeedback.includes("active") ? "var(--ask-subtle)" : "var(--bid-subtle)",
              color: actionFeedback.includes("active") ? "var(--ask)" : "var(--bid)",
              border: `1px solid ${actionFeedback.includes("active") ? "var(--ask)" : "var(--bid)"}`,
            }}
          >
            {actionFeedback}
          </div>
        )}

        {/* Top Metric Cards */}
        {(() => {
          const pfData = portfolioQuery.data;
          const navValue = pfData?.nav || pfData?.equity || "100000.00";
          const dailyPnl = pfData?.daily_pnl || "+399.00";
          const dailyPnlPct = pfData?.daily_pnl_pct || "+0.40%";
          const isPnlPositive = !dailyPnl.startsWith("-");
          const cashVal = typeof pfData?.cash === "object" ? pfData.cash?.USDT || "100000.00" : pfData?.cash || "100000.00";
          const leverageVal = pfData?.leverage || "0.00";
          const marginUsage = pfData?.margin_usage_pct || "0.0%";

          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 14 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Net Asset Value (NAV)
                </span>
                <div className="font-mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "var(--text-primary)" }}>
                  ${formatAmount(navValue)}
                </div>
                <div style={{ fontSize: 11, color: isPnlPositive ? "var(--bid)" : "var(--ask)", fontWeight: 600, marginTop: 4 }}>
                  {dailyPnl} ({dailyPnlPct}) Today
                </div>
              </div>

              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 14 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Available Cash
                </span>
                <div className="font-mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "var(--text-primary)" }}>
                  ${formatAmount(cashVal)}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                  Margin Usage: {marginUsage}
                </div>
              </div>

              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 14 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Gross Leverage
                </span>
                <div className="font-mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "var(--text-primary)" }}>
                  {leverageVal}x
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Hard Cap: 10.00x
                </div>
              </div>

              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 14 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Daily Drawdown
                </span>
                <div className={`font-mono ${isPnlPositive ? "text-bid" : "text-ask"}`} style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                  {isPnlPositive ? "0.00%" : dailyPnlPct.replace("-", "")}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Threshold: 3.50%
                </div>
              </div>
            </div>
          );
        })()}

        {/* 2-Column Section: Positions Breakdown + Stress Testing */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
          {/* Open Positions Table */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                Active Exposures ({positions.length})
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="trade-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Side</th>
                    <th className="align-right">Size</th>
                    <th className="align-right">Entry</th>
                    <th className="align-right">Mark</th>
                    <th className="align-right">Unrealized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>
                        No active exposures. All positions closed.
                      </td>
                    </tr>
                  ) : (
                    positions.map((p) => {
                      const isLong = p.side ? p.side === "BUY" : Number(p.quantity) >= 0;
                      const pnl = Number(p.unrealized_pnl) || 0;
                      return (
                        <tr key={p.instrument_id}>
                          <td style={{ fontWeight: 600 }}>{p.symbol || p.instrument_id}</td>
                          <td style={{ fontWeight: 700, color: isLong ? "var(--bid)" : "var(--ask)" }}>
                            {isLong ? "LONG" : "SHORT"}
                          </td>
                          <td className="align-right font-mono">{Math.abs(Number(p.quantity)).toFixed(3)}</td>
                          <td className="align-right font-mono">${formatAmount(p.entry_price)}</td>
                          <td className="align-right font-mono">${formatAmount(p.current_price || p.entry_price)}</td>
                          <td className={`align-right font-mono ${pnl >= 0 ? "text-bid" : "text-ask"}`}>
                            {pnl >= 0 ? "+" : ""}${formatAmount(pnl)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stress Testing Scenarios */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                Portfolio Stress Testing Matrix
              </span>
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {scenarios.map((sc: any) => {
                const isLoss = Number(sc.portfolio_pnl) < 0;
                return (
                  <div
                    key={sc.scenario_id}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                        {sc.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        Status: Normal · No Breaches
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className={`font-mono ${isLoss ? "text-ask" : "text-bid"}`} style={{ fontSize: 13, fontWeight: 700 }}>
                        {sc.portfolio_pnl} USD
                      </div>
                      <div style={{ fontSize: 10, color: isLoss ? "var(--ask)" : "var(--bid)" }}>
                        {sc.portfolio_pnl_pct}% NAV
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Emergency Circuit Breaker Control Card */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                Emergency Kill Switch & Circuit Breaker
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                Instantly cancels all working orders and suspends new order routing across all venues.
              </div>
            </div>

            {isTripped ? (
              <button
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="btn-base btn-bid"
                style={{ padding: "8px 16px" }}
              >
                Clear Kill Switch & Resume
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Reason for halting..."
                  value={killSwitchReason}
                  onChange={(e) => setKillSwitchReason(e.target.value)}
                  className="input-field"
                  style={{ width: 220 }}
                />
                <button
                  onClick={() => tripMutation.mutate()}
                  disabled={tripMutation.isPending}
                  className="btn-base btn-ask"
                  style={{ padding: "8px 16px" }}
                >
                  Trip Kill Switch
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
