import { describe, expect, it, vi } from "vitest";
import { JupiterPredictionProvider } from "../src/index.js";

describe("JupiterPredictionProvider", () => {
  it("maps buy and sell prices and resolution rules from an open market", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              metadata: { title: "Election" },
              category: "Politics",
              markets: [
                {
                  marketId: "MARKET-1",
                  status: "open",
                  title: "Candidate wins",
                  provider: "polymarket",
                  closeTime: Math.floor(Date.now() / 1000) + 86400,
                  rulesPrimary: "Official result determines settlement.",
                  pricing: {
                    buyYesPriceUsd: 600000,
                    buyNoPriceUsd: 430000,
                    sellYesPriceUsd: 580000,
                    sellNoPriceUsd: 400000,
                  },
                },
              ],
            },
          ],
        }),
      ),
    );
    const markets = await new JupiterPredictionProvider(
      "https://example.test",
      "test-key",
      fetcher,
    ).listOpenMarkets();
    expect(markets).toHaveLength(1);
    expect(markets[0]?.outcomes).toMatchObject([
      { label: "YES", probability: "0.6", sellPrice: "0.58" },
      { label: "NO", probability: "0.43", sellPrice: "0.4" },
    ]);
    expect(markets[0]?.resolutionRules).toContain("Official result");
  });

  it("excludes a market whose close time has passed even if Jupiter still labels it open", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              markets: [
                {
                  marketId: "STALE",
                  status: "open",
                  closeTime: Math.floor(Date.now() / 1000) - 1,
                  rulesPrimary: "Official result",
                  pricing: { buyYesPriceUsd: 500000, buyNoPriceUsd: 500000 },
                },
              ],
            },
          ],
        }),
      ),
    );
    const markets = await new JupiterPredictionProvider(
      "https://example.test",
      undefined,
      fetcher,
    ).listOpenMarkets();
    expect(markets).toEqual([]);
  });
});
