import { describe, expect, it } from "vitest";
import { compileIntent } from "../src/index.js";

describe("intent compiler", () => {
  it("compiles an order only as a confirmable draft", () => {
    expect(compileIntent("Buy 0.25 BTC/USDT at 61000")).toEqual({
      kind: "order_draft",
      side: "buy",
      quantity: "0.25",
      symbol: "BTCUSDT",
      orderType: "limit",
      limitPrice: "61000",
      requiresConfirmation: true,
      sourceText: "Buy 0.25 BTC/USDT at 61000",
    });
  });

  it("does not coerce ambiguous text into an order", () => {
    expect(compileIntent("Should I add bitcoin exposure?").kind).toBe("research_query");
  });
});
