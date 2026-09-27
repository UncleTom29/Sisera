import { describe, expect, it } from "vitest";
import {
  PythCoreProvider,
  decimalFromMantissa,
  fairValue,
  parsePythReference,
} from "../src/pyth-core.js";

const feedId = "a".repeat(64);
const otherId = "b".repeat(64);
const now = 1_750_000_000_000;
const payload = (publishTime: number) => ({
  parsed: [
    {
      id: feedId,
      price: { price: "12345678", conf: "12000", expo: -5, publish_time: publishTime },
    },
  ],
});

describe("Pyth Core reference pricing", () => {
  it("preserves decimal precision", () => {
    expect(decimalFromMantissa("12345678", -5)).toBe("123.45678");
    expect(decimalFromMantissa("123", -5)).toBe("0.00123");
    expect(decimalFromMantissa("-100000", -5)).toBe("-1");
  });

  it("labels old and future oracle timestamps", () => {
    const fresh = parsePythReference(payload(now / 1000), "Equity.US.AAPL/USD", feedId, now);
    expect(fresh.referenceFreshness).toBe("live");
    expect(fresh.source).toBe("pyth-core");
    const old = parsePythReference(payload(now / 1000 - 61), "Equity.US.AAPL/USD", feedId, now);
    expect(old.referenceFreshness).toBe("stale");
    expect(old.ageMs).toBe(61_000);
    expect(() =>
      parsePythReference(payload(now / 1000 + 61), "Equity.US.AAPL/USD", feedId, now),
    ).toThrow("future");
  });

  it("compares real reference prices without inventing historical volatility", () => {
    const reference = parsePythReference(payload(now / 1000), "Equity.US.AAPL/USD", feedId, now);
    const comparison = fairValue("125", reference);
    expect(Number(comparison.premiumDiscountBps)).toBeGreaterThan(100);
    expect(comparison.divergenceZScore).toBeNull();
    expect(comparison.executable).toBe(false);
  });

  it("uses exact equity symbols and batches updates", async () => {
    const calls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return Response.json(
        calls.length === 1
          ? [
              { id: feedId, attributes: { symbol: "Equity.US.AAPL/USD", asset_type: "Equity" } },
              { id: otherId, attributes: { symbol: "Equity.US.TSLA/USD", asset_type: "Equity" } },
            ]
          : payload(Math.floor(Date.now() / 1000)),
      );
    }) as typeof fetch;
    const provider = new PythCoreProvider("core-key", "https://hermes.test", fetcher);
    const references = await provider.getLatestEquities(["AAPL", "UNKNOWN"]);
    expect(references.map((item) => item.symbol)).toEqual(["Equity.US.AAPL/USD"]);
    expect(calls[1]).toContain("ids%5B%5D=");
    expect(calls).toHaveLength(2);
  });
});
