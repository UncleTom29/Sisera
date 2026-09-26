import { describe, expect, it, vi } from "vitest";
import { BinanceTradingClient } from "../src/binance-trading.js";

describe("BinanceTradingClient", () => {
  it("checks signed account balance and lot rules before submitting a market order", async () => {
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/api/v3/account"))
        return new Response(
          JSON.stringify({ canTrade: true, balances: [{ asset: "USDT", free: "10000" }] }),
        );
      if (url.includes("/api/v3/exchangeInfo"))
        return new Response(
          JSON.stringify({
            symbols: [
              {
                symbol: "BTCUSDT",
                status: "TRADING",
                baseAsset: "BTC",
                quoteAsset: "USDT",
                filters: [
                  { filterType: "LOT_SIZE", minQty: "0.00001", maxQty: "100", stepSize: "0.00001" },
                ],
              },
            ],
          }),
        );
      expect(options?.method).toBe("POST");
      expect(options?.headers).toEqual({ "X-MBX-APIKEY": "a".repeat(24) });
      expect(url).toContain("signature=");
      return new Response(
        JSON.stringify({
          symbol: "BTCUSDT",
          orderId: 42,
          clientOrderId: "sis_test",
          status: "FILLED",
          executedQty: "0.01",
          cummulativeQuoteQty: "500",
        }),
      );
    });
    const client = new BinanceTradingClient("https://example.test", fetcher as typeof fetch);
    const result = await client.placeMarketOrder({
      apiKey: "a".repeat(24),
      apiSecret: "b".repeat(32),
      symbol: "BTCUSDT",
      side: "buy",
      quantity: "0.01",
      indicativePrice: "50000",
      clientOrderId: "sis_test",
    });
    expect(result.status).toBe("FILLED");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects an order exceeding its free-balance cap", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/api/v3/account"))
        return new Response(
          JSON.stringify({ canTrade: true, balances: [{ asset: "USDT", free: "1000" }] }),
        );
      return new Response(
        JSON.stringify({
          symbols: [
            {
              symbol: "BTCUSDT",
              status: "TRADING",
              baseAsset: "BTC",
              quoteAsset: "USDT",
              filters: [],
            },
          ],
        }),
      );
    });
    const client = new BinanceTradingClient("https://example.test", fetcher as typeof fetch);
    await expect(
      client.placeMarketOrder({
        apiKey: "a".repeat(24),
        apiSecret: "b".repeat(32),
        symbol: "BTCUSDT",
        side: "buy",
        quantity: "0.01",
        indicativePrice: "50000",
        clientOrderId: "sis_test",
      }),
    ).rejects.toThrow("20% of free USDT");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
