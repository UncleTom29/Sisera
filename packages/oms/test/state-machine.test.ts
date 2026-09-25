import type { OrderIntent, RiskDecision } from "@sisera/domain";
import { describe, expect, it } from "vitest";
import { applyOrderEvent, createOrderRecord } from "../src/index.js";

const intent: OrderIntent = {
  clientOrderId: "client-001",
  portfolioId: "portfolio-1",
  accountId: "paper-main",
  instrumentId: "binance:BTCUSDT:spot",
  side: "buy",
  type: "market",
  quantity: "0.1",
  timeInForce: "gtc",
  reduceOnly: false,
  mode: "paper",
  submittedBy: "user-1",
  correlationId: "corr-0001",
};
const approved: RiskDecision = {
  outcome: "approved",
  checkedAt: "2026-01-01T00:00:00.000Z",
  orderNotional: "6000",
  projectedGrossExposure: "6000",
  projectedNetExposure: "6000",
  reasons: [],
};

describe("OMS state machine", () => {
  it("requires risk approval before routing", () => {
    const draft = createOrderRecord("order-1", intent);
    expect(() => applyOrderEvent(draft, { type: "routed", at: approved.checkedAt })).toThrow();
    const accepted = applyOrderEvent(draft, {
      type: "risk_evaluated",
      decision: approved,
      at: approved.checkedAt,
    });
    expect(applyOrderEvent(accepted, { type: "routed", at: approved.checkedAt }).status).toBe(
      "working",
    );
  });
});
