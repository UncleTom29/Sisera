import { describe, expect, it, vi } from "vitest";
import { BinanceSpotProvider, CoinGeckoReferenceProvider } from "../src/index.js";

describe("BinanceSpotProvider", () => {
  it("loads a market list with three batch requests instead of one request per symbol", async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/ping")) return new Response("{}");
      if (url.includes("exchangeInfo"))
        return new Response(
          JSON.stringify({
            symbols: [
              {
                symbol: "BTCUSDT",
                baseAsset: "BTC",
                quoteAsset: "USDT",
                status: "TRADING",
                filters: [],
              },
              {
                symbol: "ETHUSDT",
                baseAsset: "ETH",
                quoteAsset: "USDT",
                status: "TRADING",
                filters: [],
              },
            ],
          }),
        );
      if (url.includes("bookTicker"))
        return new Response(
          JSON.stringify([
            { symbol: "BTCUSDT", bidPrice: "10", askPrice: "11" },
            { symbol: "ETHUSDT", bidPrice: "20", askPrice: "21" },
          ]),
        );
      return new Response(
        JSON.stringify([
          { symbol: "BTCUSDT", lastPrice: "10.5", priceChangePercent: "1.2", quoteVolume: "1000" },
          { symbol: "ETHUSDT", lastPrice: "20.5", priceChangePercent: "2.3", quoteVolume: "2000" },
        ]),
      );
    });
    const rows = await new BinanceSpotProvider("https://example.test", fetcher).listMarkets([
      "BTCUSDT",
      "ETHUSDT",
    ]);
    expect(rows.map((row) => row.instrument.venueSymbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(rows[1]?.snapshot.last).toBe("20.5");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("uses the public market-data endpoint by default", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ symbol: "BTCUSDT", bidPrice: "10", askPrice: "11" })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ lastPrice: "10.5", priceChangePercent: "1.2", quoteVolume: "1000" }),
        ),
      );
    await new BinanceSpotProvider(undefined, fetcher).getSnapshot("BTCUSDT");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("https://data-api.binance.vision/api/v3/ticker/"),
      expect.any(Object),
    );
  });

  it("normalizes a live venue response without inventing fields", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}"))
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
    const provider = new BinanceSpotProvider("https://example.test", fetcher);
    await expect(provider.getSnapshot("BTCUSDT")).rejects.toMatchObject({
      code: "MARKET_DATA_UNAVAILABLE",
    });
    await expect(provider.getSnapshot("ETHUSDT")).rejects.toMatchObject({
      code: "MARKET_DATA_UNAVAILABLE",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("normalizes candles and order-book depth", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}"))
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

describe("CoinGeckoReferenceProvider", () => {
  it("returns explicitly sourced USD references without inventing venue quotes", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "bitcoin",
            name: "Bitcoin",
            current_price: 85000,
            price_change_percentage_24h: 1.25,
            total_volume: 1000000,
            last_updated: "2026-09-25T08:00:00.000Z",
          },
        ]),
      ),
    );
    const provider = new CoinGeckoReferenceProvider("https://example.test", fetcher);
    const rows = await provider.list(["BTCUSDT", "UNKNOWN"]);
    expect(rows).toEqual([
      {
        symbol: "BTCUSDT",
        name: "Bitcoin",
        priceUsd: 85000,
        change24hPct: 1.25,
        volume24hUsd: 1000000,
        observedAt: "2026-09-25T08:00:00.000Z",
        source: "coingecko",
      },
    ]);
    expect(await provider.list(["BTCUSDT"])).toEqual(rows);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed when reference data is unavailable", async () => {
    const provider = new CoinGeckoReferenceProvider(
      "https://example.test",
      vi.fn().mockRejectedValue(new TypeError("offline")),
    );
    await expect(provider.list(["BTCUSDT"])).rejects.toMatchObject({
      code: "MARKET_DATA_UNAVAILABLE",
    });
  });
});
