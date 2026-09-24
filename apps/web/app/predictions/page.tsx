"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatAmount, formatCompact } from "@sisera/ui";
import type { PredictionMarketRecord } from "@sisera/api-client";

export default function PredictionsHubPage() {
  const [selectedMarketId, setSelectedMarketId] = useState<string>("pred_fed_cut_nov_2026");
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>("out_yes");
  const [shares, setShares] = useState("100");
  const [feedback, setFeedback] = useState<string | null>(null);

  const predictionsQuery = useQuery({
    queryKey: ["predictions"],
    queryFn: () => api.listPredictions(),
  });

  const orderMutation = useMutation({
    mutationFn: () =>
      api.placePredictionOrder(
        selectedMarket?.market_id || selectedMarketId,
        selectedOutcome?.outcome_id || selectedOutcomeId,
        shares,
        "BUY"
      ),
    onSuccess: (data) => {
      setFeedback(`Bought ${data.quantity} shares of ${data.outcome_id.toUpperCase()} on "${selectedMarket?.question || data.market_id}"`);
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: any) => {
      setFeedback(`Order error: ${err.message}`);
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  const markets = predictionsQuery.data || [];
  const selectedMarket = markets.find((m) => m.market_id === selectedMarketId) || markets[0];
  const selectedOutcome = selectedMarket?.outcomes?.find((o) => o.outcome_id === selectedOutcomeId) || selectedMarket?.outcomes?.[0];

  const pricePerShare = selectedOutcome ? Number(selectedOutcome.price) : 0.78;
  const totalCost = (Number(shares) * pricePerShare).toFixed(2);
  const potentialPayout = (Number(shares) * 1.0).toFixed(2);
  const potentialProfit = (Number(potentialPayout) - Number(totalCost)).toFixed(2);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 18, background: "var(--bg-root)" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              Prediction Markets & Event Contracts
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Probabilistic pricing of macroeconomic, monetary policy, and protocol catalysts.
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
              background: feedback.includes("error") ? "var(--ask-subtle)" : "var(--bid-subtle)",
              color: feedback.includes("error") ? "var(--ask)" : "var(--bid)",
              border: `1px solid ${feedback.includes("error") ? "var(--ask)" : "var(--bid)"}`,
            }}
          >
            {feedback}
          </div>
        )}

        {/* 2-Column: Markets List + Event Ticket */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr", gap: 16 }}>
          {/* Contracts List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
              Active Event Contracts ({markets.length})
            </div>

            {markets.map((m: PredictionMarketRecord) => {
              const isSelected = m.market_id === selectedMarketId;
              return (
                <div
                  key={m.market_id}
                  onClick={() => {
                    setSelectedMarketId(m.market_id);
                    if (m.outcomes?.[0]) setSelectedOutcomeId(m.outcomes[0].outcome_id);
                  }}
                  style={{
                    background: "var(--bg-surface)",
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 6,
                    padding: 14,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>
                      {m.question}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: 3,
                        background: "var(--bg-card)",
                        color: "var(--text-secondary)",
                        marginLeft: 10,
                      }}
                    >
                      {m.category}
                    </span>
                  </div>

                  {/* Outcome Probability Bars */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {m.outcomes.map((out) => {
                      const prob = (Number(out.probability) * 100).toFixed(0);
                      const isYes = out.label.toLowerCase() === "yes";
                      return (
                        <div
                          key={out.outcome_id}
                          style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "8px 10px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isYes ? "var(--bid)" : "var(--ask)" }}>
                              {out.label}
                            </span>
                            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>
                              ${out.price}
                            </span>
                          </div>
                          <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                            {prob}%
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Meta stats */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
                    <span>Oracle: {m.oracle}</span>
                    <span>24h Vol: ${formatCompact(m.volume)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Event Contract Ticket */}
          {selectedMarket && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                  Order Ticket: Event Contract
                </span>
              </div>

              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 }}>
                  {selectedMarket.question}
                </div>

                {/* Outcome Selector */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {selectedMarket.outcomes.map((out) => {
                    const isSelected = out.outcome_id === selectedOutcomeId;
                    const isYes = out.label.toLowerCase() === "yes";
                    return (
                      <button
                        key={out.outcome_id}
                        type="button"
                        onClick={() => setSelectedOutcomeId(out.outcome_id)}
                        style={{
                          padding: "8px 0",
                          borderRadius: 4,
                          border: "none",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          background: isSelected
                            ? isYes
                              ? "var(--bid)"
                              : "var(--ask)"
                            : "var(--bg-card)",
                          color: isSelected
                            ? isYes
                              ? "#041a10"
                              : "#ffffff"
                            : "var(--text-secondary)",
                        }}
                      >
                        {out.label} (${out.price})
                      </button>
                    );
                  })}
                </div>

                {/* Shares input */}
                <div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                    Shares Quantity
                  </span>
                  <input
                    type="text"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="input-field font-mono"
                    style={{ marginTop: 3 }}
                  />
                </div>

                {/* Payoff Calculation */}
                <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 4, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>Total Cost</span>
                    <span className="font-mono" style={{ fontWeight: 600 }}>${totalCost}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>Potential Payout</span>
                    <span className="font-mono text-bid" style={{ fontWeight: 600 }}>${potentialPayout}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>Net Return</span>
                    <span className="font-mono text-bid" style={{ fontWeight: 700 }}>+${potentialProfit}</span>
                  </div>
                </div>

                <button
                  onClick={() => orderMutation.mutate()}
                  disabled={orderMutation.isPending}
                  className="btn-base btn-bid"
                  style={{ padding: "9px 0", fontSize: 12, fontWeight: 700, marginTop: 6 }}
                >
                  {orderMutation.isPending ? "Executing..." : `Buy ${shares} Shares (${selectedOutcome?.label})`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
