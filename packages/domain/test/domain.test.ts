import { describe, expect, it } from "vitest";
import { OrderIntent, roleCan } from "../src/index.js";

describe("trading domain", () => {
  it("rejects floating point order values", () => {
    const result = OrderIntent.safeParse({
      clientOrderId: "client-001",
      portfolioId: "portfolio-1",
      accountId: "paper-main",
      instrumentId: "binance:BTCUSDT:spot",
      side: "buy",
      type: "market",
      quantity: 0.1,
      mode: "paper",
      submittedBy: "user-1",
      correlationId: "corr-0001",
    });
    expect(result.success).toBe(false);
  });

  it("keeps risk administration separate from trading", () => {
    expect(roleCan("trader", "order:paper:create")).toBe(true);
    expect(roleCan("trader", "risk:manage")).toBe(false);
  });
});
