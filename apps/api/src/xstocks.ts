import { z } from "zod";

const Mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const Asset = z.object({
  name: z.string(),
  symbol: z.string(),
  description: z.string().nullable().optional(),
  isTradingHalted: z.boolean(),
  underlying: z.object({ symbol: z.string(), type: z.string().nullable() }).nullable(),
  deployments: z.array(z.object({ address: z.string(), network: z.string() })),
});
const Page = z.object({ nodes: z.array(Asset), page: z.object({ hasNextPage: z.boolean() }) });
const Price = z.object({ quote: z.number().positive().nullable() });
const DexPairs = z.array(
  z.object({
    chainId: z.string(),
    baseToken: z.object({ address: z.string() }),
    priceUsd: z.string().nullable().optional(),
    liquidity: z.object({ usd: z.number().nullable().optional() }).nullable().optional(),
    volume: z.object({ h24: z.number().nullable().optional() }).nullable().optional(),
    priceChange: z.object({ h24: z.number().nullable().optional() }).nullable().optional(),
    url: z.string().url().optional(),
  }),
);

export type PublicStock = {
  name: string;
  symbol: string;
  underlyingSymbol: string;
  mint: string;
  priceUsd: string | null;
  dexPriceUsd: string | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  chartUrl: string | null;
  tradingHalted: boolean;
  fetchedAt: string;
  source: "xstocks";
};

export class XStocksClient {
  private cache: { until: number; value: PublicStock[] } | null = null;

  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async list(): Promise<PublicStock[]> {
    if (this.cache && this.cache.until > Date.now()) return this.cache.value;
    const assets: z.infer<typeof Asset>[] = [];
    const response = await this.fetcher(
      "https://api.xstocks.fi/api/v2/public/assets?network=Solana&page=0&pageSize=100",
      { signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) throw new Error(`xStocks returned ${response.status}`);
    assets.push(...Page.parse(await response.json()).nodes);
    const featuredSymbols = [
      "AAPLx",
      "NVDAx",
      "TSLAx",
      "MSFTx",
      "GOOGLx",
      "AMZNx",
      "METAx",
      "COINx",
      "SPYx",
      "QQQx",
      "MSTRx",
      "HOODx",
      "PLTRx",
      "AMDx",
    ];
    const featuredResults = await Promise.allSettled(
      featuredSymbols.map(async (symbol) => {
        const detail = await this.fetcher(`https://api.xstocks.fi/api/v2/public/assets/${symbol}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!detail.ok) throw new Error(`xStocks ${symbol} unavailable`);
        return Asset.parse(await detail.json());
      }),
    );
    assets.push(
      ...featuredResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
    );
    const selected = assets.flatMap((asset) => {
      const deployment = asset.deployments.find((item) => item.network === "Solana");
      if (!deployment || !Mint.safeParse(deployment.address).success) return [];
      return [{ asset, mint: deployment.address }];
    });
    const fetchedAt = new Date().toISOString();
    const featuredSet = new Set(featuredSymbols);
    const featured = selected.filter(({ asset }) => featuredSet.has(asset.symbol));
    const displayed = [
      ...new Map(
        [...featured, ...selected.filter(({ asset }) => !featuredSet.has(asset.symbol))].map(
          (item) => [item.mint, item],
        ),
      ).values(),
    ].slice(0, 40);
    const dexPairs = await Promise.allSettled(
      Array.from({ length: Math.ceil(displayed.length / 30) }, async (_, index) => {
        const mints = displayed.slice(index * 30, index * 30 + 30).map((item) => item.mint);
        const response = await this.fetcher(
          `https://api.dexscreener.com/tokens/v1/solana/${mints.join(",")}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!response.ok) throw new Error(`DEX Screener returned ${response.status}`);
        return DexPairs.parse(await response.json());
      }),
    );
    const bestPairs = new Map<string, z.infer<typeof DexPairs>[number]>();
    for (const result of dexPairs)
      if (result.status === "fulfilled")
        for (const pair of result.value) {
          if (pair.chainId !== "solana" || !mintsContain(displayed, pair.baseToken.address))
            continue;
          const current = bestPairs.get(pair.baseToken.address);
          if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0))
            bestPairs.set(pair.baseToken.address, pair);
        }
    const priced = await Promise.allSettled(
      displayed.map(async ({ asset, mint }): Promise<PublicStock> => {
        const response = await this.fetcher(
          `https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(asset.symbol)}/price-data`,
          { signal: AbortSignal.timeout(8000) },
        );
        const quote = response.ok ? Price.parse(await response.json()).quote : null;
        const pair = bestPairs.get(mint);
        return {
          name: asset.name,
          symbol: asset.symbol,
          underlyingSymbol: asset.underlying?.symbol ?? asset.symbol.replace(/x$/, ""),
          mint,
          priceUsd: quote == null ? null : String(quote),
          dexPriceUsd: pair?.priceUsd ?? null,
          change24hPct: pair?.priceChange?.h24 ?? null,
          volume24hUsd: pair?.volume?.h24 ?? null,
          liquidityUsd: pair?.liquidity?.usd ?? null,
          chartUrl: pair?.url ?? null,
          tradingHalted: asset.isTradingHalted,
          fetchedAt,
          source: "xstocks",
        };
      }),
    );
    const value = priced.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    this.cache = { until: Date.now() + 60_000, value };
    return value;
  }
}

function mintsContain(items: Array<{ mint: string }>, mint: string) {
  return items.some((item) => item.mint === mint);
}
