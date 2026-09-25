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

  it("normalizes candles and order-book depth", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([[1_700_000_000_000, "10", "12", "9", "11", "42"]])),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ lastUpdateId: 12, bids: [["10", "2"]], asks: [["11", "3"]] }),
        ),
      );
    const provider = new BinanceSpotProvider("https://example.test", fetcher);
    const candles = await provider.getCandles("BTCUSDT", "1h", 30);
    const depth = await provider.getOrderBook("BTCUSDT", 20);
    expect(candles[0]).toEqual({
      time: 1_700_000_000,
      open: "10",
      high: "12",
      low: "9",
      close: "11",
      volume: "42",
    });
    expect(depth.sequence).toBe("12");
    expect(depth.bids[0]).toEqual({ price: "10", quantity: "2" });
  });
});
