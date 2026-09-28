import { describe, expect, it } from "vitest";
import { CoinMarketCapClient } from "../src/coinmarketcap.js";

describe("CoinMarketCap Solana candles", () => {
  it("reads real candle fields and accepts both timestamp units", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/public-api/v1/k-line/candles?");
      return new Response(
        JSON.stringify({
          data: [
            [2, 3, 1, 2.5, 100, 1_790_215_200_000, 7],
            [2.5, 4, 2, 3.5, 120, 1_790_218_800, 8],
          ],
        }),
        { status: 200 },
      );
    };
    const client = new CoinMarketCapClient("unused", fetcher as typeof fetch);
    const candles = await client.solanaTokenCandles("11111111111111111111111111111111");
    expect(candles).toHaveLength(2);
    expect(candles[0]?.time).toBe("2026-09-24T02:00:00.000Z");
    expect(candles[0]?.close).toBe(2.5);
    expect(candles[1]?.volumeUsd).toBe(120);
  });
});
