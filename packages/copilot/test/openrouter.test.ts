import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterResearchClient } from "../src/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("read-only OpenRouter research", () => {
  const context = {
    company: "Example",
    symbol: "EX",
    tokenPrice: "10",
    markPrice: "9",
    premiumDiscountPct: "11.1",
    fetchedAt: "2026-09-25T00:00:00Z",
    articles: [],
  };

  it("validates structured research output and never returns execution commands", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "Mark gap requires liquidity checks.",
                opportunities: ["Investigate valuation"],
                risks: ["Liquidity unknown"],
                confidence: 0.4,
                actionability: "research_only",
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await new OpenRouterResearchClient("secret", "model").assess(context);
    expect(result.actionability).toBe("research_only");
    expect(result).not.toHaveProperty("order");
    const request = JSON.parse(fetcher.mock.calls[0]?.[1].body);
    expect(request.provider.require_parameters).toBe(true);
    expect(request.messages[1].content).toContain("Example");
  });

  it("rejects executable-looking model output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Buy now",
                  opportunities: [],
                  risks: [],
                  confidence: 1,
                  actionability: "execute",
                }),
              },
            },
          ],
        }),
      }),
    );
    await expect(new OpenRouterResearchClient("secret", "model").assess(context)).rejects.toThrow();
  });
});
