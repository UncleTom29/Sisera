import { describe, expect, it, vi } from "vitest";
import { JupiterPredictionTradingClient } from "../src/jupiter-prediction.js";

describe("JupiterPredictionTradingClient", () => {
  it("reads keeper fill status without treating submission as a fill", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "partiallyfilled" })));
    const status = await new JupiterPredictionTradingClient(
      "https://example.test",
      "test-key",
      fetcher as typeof fetch,
    ).orderStatus("12345678901234567890123456789012");
    expect(status).toBe("partiallyfilled");
    expect(fetcher.mock.calls).toHaveLength(1);
  });

  it("checks an open market and trading status before building a USDC order", async () => {
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/markets/"))
        return new Response(
          JSON.stringify({
            marketId: "POLY-123",
            status: "open",
            closeTime: Math.floor(Date.now() / 1000) + 86400,
            rulesPrimary: "Official result",
            pricing: { buyYesPriceUsd: 400000, buyNoPriceUsd: 600000 },
          }),
        );
      if (url.endsWith("/trading-status"))
        return new Response(JSON.stringify({ trading_active: true }));
      expect(options?.method).toBe("POST");
      expect(JSON.parse(String(options?.body))).toMatchObject({
        marketId: "POLY-123",
        isYes: true,
        depositAmount: "5000000",
      });
      return new Response(
        JSON.stringify({ transaction: "x".repeat(50), order: { orderPubkey: "1".repeat(32) } }),
      );
    });
    const result = await new JupiterPredictionTradingClient(
      "https://example.test",
      undefined,
      fetcher as typeof fetch,
    ).prepare({
      marketId: "POLY-123",
      wallet: "2".repeat(32),
      isYes: true,
      depositAmount: "5000000",
    });
    expect(result.priceUsd).toBe(0.4);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not prepare an order after close time despite an open status", async () => {
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/markets/")
              ? {
                  marketId: "POLY-123",
                  status: "open",
                  closeTime: Math.floor(Date.now() / 1000) - 1,
                  rulesPrimary: "Official result",
                  pricing: { buyYesPriceUsd: 400000, buyNoPriceUsd: 600000 },
                }
              : { trading_active: true },
          ),
        ),
    );
    await expect(
      new JupiterPredictionTradingClient(
        "https://example.test",
        undefined,
        fetcher as typeof fetch,
      ).prepare({
        marketId: "POLY-123",
        wallet: "2".repeat(32),
        isYes: true,
        depositAmount: "5000000",
      }),
    ).rejects.toThrow("closed");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
