import { describe, expect, it } from "vitest";
import { AgentDraftInput, compileAgentDraft } from "../src/agent-governance.js";

const input = {
  name: "BTC trend research",
  description: "Research EMA crossover with confirmed volume and explicit abstention.",
  universe: ["BTCUSDT"],
  timeframe: "1h",
  factors: ["EMA 12/26 crossover", "Relative volume above 1.2"],
  capitalLimitUsd: 10_000,
  maxTradeNotionalUsd: 1_000,
  maxDailyDrawdownPct: 3,
  maxOpenPositions: 2,
  stopLossPct: 1.5,
  takeProfitPct: 4,
  maxSlippageBps: 25,
};

describe("agent draft governance", () => {
  it("compiles a deterministic research-only manifest", () => {
    const manifest = compileAgentDraft(AgentDraftInput.parse(input));
    expect(manifest).toEqual(compileAgentDraft(AgentDraftInput.parse(input)));
    expect(manifest.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.policy.execution.proposalOnly).toBe(true);
    expect(manifest.policy.capitalAllocation.maxLeverage).toBe(1);
    expect(manifest.policy.riskGuardrails.killSwitchAction).toBe("CANCEL_ALL_AND_HALT");
  });

  it("rejects attempts to request stage or authority and invalid risk limits", () => {
    expect(AgentDraftInput.safeParse({ ...input, stage: "live" }).success).toBe(false);
    expect(AgentDraftInput.safeParse({ ...input, autonomy: "autonomous" }).success).toBe(false);
    expect(AgentDraftInput.safeParse({ ...input, maxTradeNotionalUsd: 11_000 }).success).toBe(
      false,
    );
  });
});
