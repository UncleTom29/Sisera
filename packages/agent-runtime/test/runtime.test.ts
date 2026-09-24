import type { AgentManifest } from "@sisera/domain";
import { describe, expect, it } from "vitest";
import { canTransitionAgent, createAgentProposal } from "../src/index.js";

const manifest: AgentManifest = {
  id: "btc-trend",
  name: "BTC Trend",
  version: "1.0.0",
  autonomy: "suggest",
  stage: "paper",
  capitalLimit: "10000",
  maxOrderNotional: "1000",
  maxDailyDrawdownPct: "2",
  allowedInstruments: ["binance:BTCUSDT:spot"],
  killSwitch: "cancel_and_halt",
};

describe("agent governance", () => {
  it("does not allow promotion to skip evaluation stages", () => {
    expect(canTransitionAgent("paper", "live")).toBe(false);
    expect(canTransitionAgent("paper", "shadow")).toBe(true);
  });

  it("emits proposals instead of execution commands", () => {
    expect(createAgentProposal(manifest, { side: "buy" }, "proposal-1").status).toBe("proposed");
  });
});
