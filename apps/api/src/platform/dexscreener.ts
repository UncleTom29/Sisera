import { z } from "zod";

const Pair = z
  .object({
    chainId: z.string(),
    pairAddress: z.string().optional(),
    url: z.string().optional(),
    dexId: z.string().optional(),
    baseToken: z.object({ address: z.string(), symbol: z.string().optional() }),
    quoteToken: z.object({ address: z.string(), symbol: z.string().optional() }).optional(),
    priceUsd: z.string().nullable().optional(),
    liquidity: z.object({ usd: z.number().nullable().optional() }).nullable().optional(),
    volume: z.record(z.number().nullable()).nullable().optional(),
    priceChange: z.record(z.number().nullable()).nullable().optional(),
    txns: z
      .record(z.object({ buys: z.number(), sells: z.number() }))
      .nullable()
      .optional(),
    fdv: z.number().nullable().optional(),
    marketCap: z.number().nullable().optional(),
    pairCreatedAt: z.number().nullable().optional(),
  })
  .passthrough();

export type TokenMarket = {
  mint: string;
  priceUsd: number | null;
  liquidityUsd: number;
  volume24hUsd: number | null;
  change1hPct: number | null;
  change6hPct: number | null;
  change24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  marketCapUsd: number | null;
  pairs: number;
  topPairUrl: string | null;
  topPairAddress: string | null;
  topDex: string | null;
  observedAt: string;
};

/** DEX Screener token markets, aggregated across every pool a token trades in. */
export class DexScreenerClient {
  private readonly cache = new Map<string, { until: number; value: TokenMarket | null }>();

  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async markets(mints: readonly string[], ttlMs = 30_000): Promise<Map<string, TokenMarket>> {
    const result = new Map<string, TokenMarket>();
    const missing: string[] = [];
    for (const mint of new Set(mints)) {
      const cached = this.cache.get(mint);
      if (cached && cached.until > Date.now()) {
        if (cached.value) result.set(mint, cached.value);
      } else missing.push(mint);
    }
    const batches = Array.from({ length: Math.ceil(missing.length / 30) }, (_, index) =>
      missing.slice(index * 30, index * 30 + 30),
    );
    await Promise.all(
      batches.map(async (batch) => {
        try {
          const response = await this.fetcher(
            `https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (!response.ok) throw new Error(`DEX Screener returned ${response.status}`);
          const pairs = z.array(Pair).parse(await response.json());
          const observedAt = new Date().toISOString();
          for (const mint of batch) {
            const own = pairs.filter(
              (pair) => pair.chainId === "solana" && pair.baseToken.address === mint,
            );
            if (!own.length) {
              this.cache.set(mint, { until: Date.now() + ttlMs, value: null });
              continue;
            }
            const top = [...own].sort(
              (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
            )[0];
            const sum = (pick: (pair: z.infer<typeof Pair>) => number | null | undefined) =>
              own.reduce((total, pair) => total + (pick(pair) ?? 0), 0);
            const market: TokenMarket = {
              mint,
              priceUsd: top?.priceUsd ? Number(top.priceUsd) : null,
              liquidityUsd: sum((pair) => pair.liquidity?.usd),
              volume24hUsd: sum((pair) => pair.volume?.h24),
              change1hPct: top?.priceChange?.h1 ?? null,
              change6hPct: top?.priceChange?.h6 ?? null,
              change24hPct: top?.priceChange?.h24 ?? null,
              buys24h: sum((pair) => pair.txns?.h24?.buys),
              sells24h: sum((pair) => pair.txns?.h24?.sells),
              marketCapUsd: top?.marketCap ?? top?.fdv ?? null,
              pairs: own.length,
              topPairUrl: top?.url ?? null,
              topPairAddress: top?.pairAddress ?? null,
              topDex: top?.dexId ?? null,
              observedAt,
            };
            this.cache.set(mint, { until: Date.now() + ttlMs, value: market });
            result.set(mint, market);
          }
        } catch {
          // A failed batch leaves those tokens without liquidity data rather than failing callers.
        }
      }),
    );
    if (this.cache.size > 5000) this.cache.clear();
    return result;
  }
}
