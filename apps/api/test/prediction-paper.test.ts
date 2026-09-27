import { describe, expect, it } from "vitest";
import { JupiterPredictionTradingClient } from "../src/jupiter-prediction.js";
import { settlePredictionPaperOrder } from "../src/prediction-paper.js";

describe("prediction paper orders", () => {
  it("deducts a 0.5% fee, debits cash, and accumulates contracts", () => {
    const initial = { cashUsd: "100", positions: {} };
    const order = {
      marketId: "MARKET-123",
      outcome: "yes" as const,
      depositUsd: "10",
      priceUsd: "0.4",
    };
    const first = settlePredictionPaperOrder(initial, order);
    expect(first.feeUsd).toBe("0.05");
    expect(first.contracts).toBe("24.875");
    expect(first.state.cashUsd).toBe("90");
    const second = settlePredictionPaperOrder(first.state, order);
    expect(second.state.positions["MARKET-123:yes"]).toEqual({
      contracts: "49.75",
      costUsd: "20",
    });
  });

  it("rejects an unaffordable order and an invalid outcome price", () => {
    const state = { cashUsd: "5", positions: {} };
    expect(() =>
      settlePredictionPaperOrder(state, {
        marketId: "MARKET-123",
        outcome: "no",
        depositUsd: "10",
        priceUsd: "0.6",
      }),
    ).toThrow("Insufficient paper USDC");
    expect(() =>
      settlePredictionPaperOrder(state, {
        marketId: "MARKET-123",
        outcome: "no",
        depositUsd: "5",
        priceUsd: "1",
      }),
    ).toThrow("price below $1");
  });

  it("quotes an open market without preparing a live transaction", async () => {
    const requests: string[] = [];
    const client = new JupiterPredictionTradingClient("https://example.test", undefined, (async (
      url: string,
    ) => {
      requests.push(url);
      return new Response(
        JSON.stringify(
          url.includes("/markets/")
            ? {
                marketId: "MARKET-123",
                status: "open",
                closeTime: Math.floor(Date.now() / 1000) + 3600,
                rulesPrimary: "Official result",
                pricing: { buyYesPriceUsd: 400000, buyNoPriceUsd: 600000 },
              }
            : { trading_active: true },
        ),
      );
    }) as typeof fetch);
    expect((await client.quote("MARKET-123", false)).priceUsd).toBe("0.600000");
    expect(requests).toHaveLength(2);
    expect(requests.some((url) => url.endsWith("/orders"))).toBe(false);
  });
});
