"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatAmount, formatCurrency, formatPct } from "@sisera/ui";
import type { AgentRecord } from "@sisera/api-client";

export default function AgentsStudioPage() {
  const [strategyName, setStrategyName] = useState("BTC Trend Follower v2");
  const [capital, setCapital] = useState("50000");
  const [manifestYaml, setManifestYaml] = useState(`name: btc-trend-follower-v2
universe:
  - "binance:BTC/USDT:perpetual"
  - "hyperliquid:BTC-USD:perpetual"
signals:
  - type: ema_cross
    fast: 12
    slow: 26
filters:
  - type: funding_percentile
    max_percentile: 80
risk_guardrails:
  max_capital_usd: 50000
  risk_per_trade_pct: 0.5
  max_daily_drawdown_pct: 3.0
execution:
  algorithm: SOR_MAKER_FIRST
  max_slippage_bps: 2.0
autonomy: POLICY_AUTO`);

  const [feedback, setFeedback] = useState<string | null>(null);

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
    refetchInterval: 4000,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createAgent(strategyName, manifestYaml, "POLICY_AUTO", capital),
    onSuccess: (data) => {
      setFeedback(`Deployed strategy "${data.name}" (${data.autonomy_level})`);
      agentsQuery.refetch();
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => api.pauseAgent(id),
    onSuccess: () => {
      agentsQuery.refetch();
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => api.resumeAgent(id),
    onSuccess: () => {
      agentsQuery.refetch();
    },
  });

  const agents = agentsQuery.data || [];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 18, background: "var(--bg-root)" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              Quantitative Strategy Studio
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Deploy, monitor, and manage automated algorithmic strategies and risk guardrails.
            </p>
          </div>
        </div>

        {feedback && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--bid-subtle)",
              color: "var(--bid)",
              border: "1px solid var(--bid)",
            }}
          >
            {feedback}
          </div>
        )}

        {/* 2-Column: Active Strategies + Strategy Deployer */}
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr", gap: 16 }}>
          {/* Active Strategies */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
              Running Strategies ({agents.length})
            </div>

            {agents.map((ag: AgentRecord) => {
              const isProfit = Number(ag.daily_pnl) >= 0;
              const isPaused = ag.status === "PAUSED";
              return (
                <div
                  key={ag.agent_id}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                        {ag.name}
                      </span>
                      <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                        {ag.agent_id}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: isPaused ? "var(--warning-subtle)" : "var(--bid-subtle)",
                          color: isPaused ? "var(--warning)" : "var(--bid)",
                        }}
                      >
                        {ag.status}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: "var(--bg-card)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {ag.autonomy_level}
                      </span>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, background: "var(--bg-panel)", padding: 8, borderRadius: 4 }}>
                    <div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>24h P&L</span>
                      <div className={`font-mono ${isProfit ? "text-bid" : "text-ask"}`} style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>
                        {isProfit ? "+" : ""}${formatAmount(ag.daily_pnl)}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Allocated</span>
                      <div className="font-mono" style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                        ${formatAmount(ag.allocated_capital)}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Max Drawdown</span>
                      <div className="font-mono" style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                        {formatPct(ag.max_daily_drawdown)}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Risk / Trade</span>
                      <div className="font-mono" style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                        {formatPct(ag.risk_per_trade)}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {isPaused ? (
                      <button
                        onClick={() => resumeMutation.mutate(ag.agent_id)}
                        className="btn-base btn-bid"
                        style={{ fontSize: 10, padding: "4px 10px" }}
                      >
                        Resume Execution
                      </button>
                    ) : (
                      <button
                        onClick={() => pauseMutation.mutate(ag.agent_id)}
                        className="btn-base btn-subtle"
                        style={{ fontSize: 10, padding: "4px 10px" }}
                      >
                        Pause Strategy
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Strategy Manifest Deployer */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                Deploy Strategy Manifest
              </span>
            </div>

            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <div>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                  Strategy Name
                </span>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  className="input-field"
                  style={{ marginTop: 3 }}
                />
              </div>

              <div>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                  Allocated Capital (USD)
                </span>
                <input
                  type="text"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  className="input-field font-mono"
                  style={{ marginTop: 3 }}
                />
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                  Declarative Manifest (YAML)
                </span>
                <textarea
                  value={manifestYaml}
                  onChange={(e) => setManifestYaml(e.target.value)}
                  className="input-field font-mono"
                  rows={14}
                  style={{ marginTop: 3, resize: "none", fontSize: 11, lineHeight: 1.4 }}
                />
              </div>

              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="btn-base btn-bid"
                style={{ padding: "8px 0", fontSize: 12, fontWeight: 700, marginTop: 4 }}
              >
                {createMutation.isPending ? "Deploying..." : "Validate & Deploy Strategy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
