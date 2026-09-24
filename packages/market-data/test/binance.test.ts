import { describe, expect, it, vi } from "vitest";
import { BinanceSpotProvider } from "../src/index.js";

describe("BinanceSpotProvider", () => {
  it("normalizes a live venue response without inventing fields", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ symbol: "BTCUSDT", bidPrice: "10", askPrice: "11" })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ lastPrice: "10.5", priceChangePercent: "1.2", quoteVolume: "1000" }),
        ),
      );
    const snapshot = await new BinanceSpotProvider("https://example.test", fetcher).getSnapshot(
      "btc/usdt",
    );
    expect(snapshot.instrumentId).toBe("binance:BTCUSDT:spot");
    expect(snapshot.bid).toBe("10");
    expect(snapshot.quality.source).toBe("binance-spot");
  });

  it("classifies transport failures as provider unavailability", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("network unavailable"));
    await expect(
      new BinanceSpotProvider("https://example.test", fetcher).getSnapshot("BTCUSDT"),
    ).rejects.toMatchObject({ code: "MARKET_DATA_UNAVAILABLE" });
  });
});
