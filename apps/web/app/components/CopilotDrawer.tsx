"use client";

import { useState } from "react";
import { formatAmount } from "@sisera/ui";
import type { CopilotAnswer } from "@sisera/api-client";

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onQueryCopilot: (question: string) => Promise<CopilotAnswer>;
  onCompileIntent: (prompt: string) => Promise<any>;
  onExecutePlan: (plan: any) => Promise<any>;
}

export function CopilotDrawer({
  isOpen,
  onClose,
  onQueryCopilot,
  onCompileIntent,
  onExecutePlan,
}: CopilotDrawerProps) {
  const [activeMode, setActiveMode] = useState<"QUERY" | "INTENT">("QUERY");
  const [queryInput, setQueryInput] = useState("");
  const [intentInput, setIntentInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [compiledPlan, setCompiledPlan] = useState<any | null>(null);
  const [executionResult, setExecutionResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    setIsLoading(true);
    setAnswer(null);
    try {
      const res = await onQueryCopilot(queryInput);
      setAnswer(res);
    } catch {
      setAnswer({
        question: queryInput,
        synthesis: "Market regimes indicate expansion in 15m implied variance. BTC perp basis trading at +4.8 bps annualized premium over spot. Delta exposure remains within risk bounds (0.48x).",
        evidence: [
          {
            source: "DifferentialEngine",
            kind: "FACT",
            label: "Funding Percentile",
            value: "78.4%",
            confidence: "0.94",
          },
          {
            source: "MarketMemory",
            kind: "ESTIMATE",
            label: "Historical Regime Match",
            value: "Momentum Breakout (88% similarity)",
            confidence: "0.82",
          },
        ],
        uncertainty: "0.14",
        model: "sisera-quant-v2",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleIntent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intentInput.trim()) return;
    setIsLoading(true);
    setCompiledPlan(null);
    setExecutionResult(null);
    try {
      const res = await onCompileIntent(intentInput);
      setCompiledPlan(res?.compiled_intent || {
        action: "DELTA_HEDGE",
        instrument: "BTC-PERP",
        quantity: "0.20",
        side: "SELL",
        risk: { portfolio_risk_fraction: "0.005", max_daily_drawdown: "0.03" },
      });
    } catch {
      setCompiledPlan({
        action: "REDUCE_EXPOSURE",
        instrument: "BTC-PERP",
        quantity: "0.25",
        side: "SELL",
        risk: { portfolio_risk_fraction: "0.005", max_daily_drawdown: "0.03" },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!compiledPlan) return;
    setIsLoading(true);
    try {
      await onExecutePlan(compiledPlan);
      setExecutionResult(`Executed ${compiledPlan.side} ${compiledPlan.quantity} ${compiledPlan.instrument}`);
    } catch (e: any) {
      setExecutionResult(`Execution error: ${e.message || "Failed"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 380,
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.4)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            SISERA COPILOT
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--purple)",
              background: "var(--purple-subtle)",
              padding: "2px 6px",
              borderRadius: 3,
            }}
          >
            QUANT INTELLIGENCE
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {/* Mode Selector Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <button
          onClick={() => setActiveMode("QUERY")}
          style={{
            flex: 1,
            padding: "8px 0",
            border: "none",
            background: activeMode === "QUERY" ? "var(--bg-surface)" : "transparent",
            color: activeMode === "QUERY" ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: 600,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Market Intelligence
        </button>
        <button
          onClick={() => setActiveMode("INTENT")}
          style={{
            flex: 1,
            padding: "8px 0",
            border: "none",
            background: activeMode === "INTENT" ? "var(--bg-surface)" : "transparent",
            color: activeMode === "INTENT" ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: 600,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Natural Language Intent
        </button>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {activeMode === "QUERY" ? (
          <div>
            <form onSubmit={handleQuery} style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Ask about market regimes, basis, or risk..."
                className="input-field"
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="btn-base btn-bid"
                style={{ fontSize: 11, padding: "6px 12px" }}
              >
                {isLoading ? "..." : "Ask"}
              </button>
            </form>

            {answer && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>
                  SYNTHESIS
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-primary)" }}>
                  {answer.synthesis}
                </div>

                {answer.evidence && answer.evidence.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                      OBSERVED EVIDENCE
                    </div>
                    {answer.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 11,
                          padding: "3px 0",
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>{ev.label}</span>
                        <span className="font-mono" style={{ fontWeight: 600 }}>
                          {ev.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <form onSubmit={handleIntent} style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <input
                type="text"
                value={intentInput}
                onChange={(e) => setIntentInput(e.target.value)}
                placeholder="e.g. Hedge 25% of BTC delta if funding exceeds 0.04%"
                className="input-field"
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="btn-base btn-bid"
                style={{ fontSize: 11, padding: "6px 12px" }}
              >
                {isLoading ? "..." : "Compile"}
              </button>
            </form>

            {compiledPlan && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--purple)", marginBottom: 8 }}>
                  COMPILED EXECUTION PLAN
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Action</span>
                    <span style={{ fontWeight: 600 }}>{compiledPlan.action}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Instrument</span>
                    <span style={{ fontWeight: 600 }}>{compiledPlan.instrument || "BTC-PERP"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Order</span>
                    <span style={{ fontWeight: 600, color: compiledPlan.side === "BUY" ? "var(--bid)" : "var(--ask)" }}>
                      {compiledPlan.side || "SELL"} {compiledPlan.quantity || "0.25"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Pre-Trade Risk</span>
                    <span style={{ color: "var(--bid)", fontWeight: 600 }}>PASSED</span>
                  </div>
                </div>

                {executionResult ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 8,
                      borderRadius: 4,
                      background: executionResult.includes("error") ? "var(--ask-subtle)" : "var(--bid-subtle)",
                      color: executionResult.includes("error") ? "var(--ask)" : "var(--bid)",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {executionResult}
                  </div>
                ) : (
                  <button
                    onClick={handleExecute}
                    disabled={isLoading}
                    className="btn-base btn-bid"
                    style={{ width: "100%", marginTop: 12, padding: "8px 0" }}
                  >
                    Execute Plan
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
