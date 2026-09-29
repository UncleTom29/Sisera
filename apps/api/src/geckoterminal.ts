import { z } from "zod";

export type ChartInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const timeframes: Record<
  ChartInterval,
  { unit: "minute" | "hour" | "day"; aggregate: number; ttl: number }
> = {
  "1m": { unit: "minute", aggregate: 1, ttl: 10_000 },
  "5m": { unit: "minute", aggregate: 5, ttl: 15_000 },
  "15m": { unit: "minute", aggregate: 15, ttl: 30_000 },
  "1h": { unit: "hour", aggregate: 1, ttl: 60_000 },
  "4h": { unit: "hour", aggregate: 4, ttl: 120_000 },
  "1d": { unit: "day", aggregate: 1, ttl: 300_000 },
};

const Pools = z.object({
  data: z.array(
    z.object({
      attributes: z.object({
        address: z.string(),
        reserve_in_usd: z.string().nullable().optional(),
      }),
    }),
  ),
});
const Ohlcv = z.object({
  data: z.object({
    attributes: z.object({ ohlcv_list: z.array(z.array(z.number()).min(6)) }),
  }),
});

/**
 * Candles for any Solana token from GeckoTerminal's public API, taken from the token's deepest
 * pool. The free tier allows about 30 requests a minute, so pools and candles are cached.
 */
export class GeckoTerminalCandles {
  private readonly pools = new Map<string, { until: number; address: string | null }>();
  private readonly candles = new Map<
    string,
    {
      until: number;
      value: Array<{
        time: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volumeUsd: number;
      }>;
    }
  >();

  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  private async pool(mint: string) {
    const cached = this.pools.get(mint);
    if (cached && cached.until > Date.now()) return cached.address;
    const response = await this.fetcher(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw new Error(`GeckoTerminal returned ${response.status}`);
    const pools = Pools.parse(await response.json()).data.sort(
      (a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0),
    );
    const address = pools[0]?.attributes.address ?? null;
    this.pools.set(mint, { until: Date.now() + 60 * 60_000, address });
    return address;
  }

  async history(mint: string, interval: ChartInterval) {
    const key = `${mint}:${interval}`;
    const cached = this.candles.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    const pool = await this.pool(mint);
    if (!pool) return [];
    const timeframe = timeframes[interval];
    const response = await this.fetcher(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${timeframe.unit}?aggregate=${timeframe.aggregate}&limit=1000&currency=usd&token=${mint}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw new Error(`GeckoTerminal returned ${response.status}`);
    const value = Ohlcv.parse(await response.json())
      .data.attributes.ohlcv_list.map(([time, open, high, low, close, volume]) => ({
        time: new Date((time ?? 0) * 1000).toISOString(),
        open: open ?? 0,
        high: high ?? 0,
        low: low ?? 0,
        close: close ?? 0,
        volumeUsd: volume ?? 0,
      }))
      .reverse();
    this.candles.set(key, { until: Date.now() + timeframe.ttl, value });
    if (this.candles.size > 2000) this.candles.delete(this.candles.keys().next().value ?? "");
    return value;
  }
}
