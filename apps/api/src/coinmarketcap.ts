import { z } from "zod";

const nullableNumber = z.number().finite().nullable().optional();
const rwaQuote = z.object({
  symbol: z.string(),
  average_tokenized_price: nullableNumber,
  tokenized_market_cap: nullableNumber,
  tokenized_volume_24h: nullableNumber,
  last_updated: z.string().optional(),
});
const rwaAsset = z.object({
  rwa_id: z.number().nullable().optional(),
  name: z.string(),
  symbol: z.string(),
  slug: z.string(),
  asset_type: z.string(),
  quotes: z.array(rwaQuote).optional(),
  tokens: z
    .array(
      z.object({
        name: z.string(),
        symbol: z.string(),
        crypto_id: z.number().int().positive().nullable().optional(),
        price: nullableNumber,
        market_cap: nullableNumber,
        volume_24h: nullableNumber,
        issuer_name: z.string().nullable().optional(),
      }),
    )
    .optional(),
  tradfi_markets: z
    .array(
      z.object({
        ticker: z.string().optional(),
        exchange: z.object({ name: z.string() }).optional(),
      }),
    )
    .optional(),
  last_updated: z.string().optional(),
});
const rwaInfo = z.object({
  name: z.string(),
  symbol: z.string(),
  industry: z.string().nullable().optional(),
  employees: z.number().nullable().optional(),
  founded: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  primary_exchange: z.string().nullable().optional(),
  about: z.object({ description: z.string().nullable().optional() }).optional(),
});
const cryptoListing = z.object({
  id: z.number(),
  name: z.string(),
  symbol: z.string(),
  cmc_rank: z.number().nullable().optional(),
  circulating_supply: nullableNumber,
  max_supply: nullableNumber,
  last_updated: z.string(),
  quote: z.array(
    z.object({
      symbol: z.string(),
      price: nullableNumber,
      volume_24h: nullableNumber,
      percent_change_1h: nullableNumber,
      percent_change_24h: nullableNumber,
      percent_change_7d: nullableNumber,
      percent_change_30d: nullableNumber,
      market_cap: nullableNumber,
      market_cap_dominance: nullableNumber,
      fully_diluted_market_cap: nullableNumber,
      last_updated: z.string().optional(),
    }),
  ),
});

export type RwaMarket = {
  name: string;
  symbol: string;
  assetType: string;
  averageTokenPriceUsd: number | null;
  tokenizedMarketCapUsd: number | null;
  tokenizedVolume24hUsd: number | null;
  updatedAt: string | null;
  tokens: Array<{
    name: string;
    symbol: string;
    cryptoId: number | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    volume24hUsd: number | null;
    issuer: string | null;
  }>;
  markets: string[];
};
export type RwaProfile = {
  name: string;
  symbol: string;
  industry: string | null;
  employees: number | null;
  founded: string | null;
  website: string | null;
  primaryExchange: string | null;
  description: string | null;
};
export type CryptoMarket = {
  id: number;
  name: string;
  symbol: string;
  rank: number | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  dominancePct: number | null;
  change1hPct: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  updatedAt: string;
};
export type CryptoProfile = {
  name: string;
  symbol: string;
  description: string | null;
  categories: string[];
  launchedAt: string | null;
  website: string | null;
  explorer: string | null;
};

function normalizeRwa(asset: z.infer<typeof rwaAsset>): RwaMarket {
  const usd = asset.quotes?.find((quote) => quote.symbol === "USD");
  return {
    name: asset.name,
    symbol: asset.symbol,
    assetType: asset.asset_type,
    averageTokenPriceUsd: usd?.average_tokenized_price ?? null,
    tokenizedMarketCapUsd: usd?.tokenized_market_cap ?? null,
    tokenizedVolume24hUsd: usd?.tokenized_volume_24h ?? null,
    updatedAt: usd?.last_updated ?? asset.last_updated ?? null,
    tokens: (asset.tokens ?? []).map((token) => ({
      name: token.name,
      symbol: token.symbol,
      cryptoId: token.crypto_id ?? null,
      priceUsd: token.price ?? null,
      marketCapUsd: token.market_cap ?? null,
      volume24hUsd: token.volume_24h ?? null,
      issuer: token.issuer_name ?? null,
    })),
    markets: (asset.tradfi_markets ?? []).flatMap((market) =>
      market.exchange?.name ? [market.exchange.name] : [],
    ),
  };
}

export class CoinMarketCapClient {
  private cache = new Map<string, { until: number; data: unknown }>();
  private pending = new Map<string, Promise<unknown>>();
  private dexCache = new Map<
    string,
    { until: number; data: ReturnType<CoinMarketCapClient["normalizeDexCandles"]> }
  >();

  constructor(
    private readonly key: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly baseUrl = "https://pro-api.coinmarketcap.com",
  ) {}

  private async request(path: string, ttlMs: number): Promise<unknown> {
    const cached = this.cache.get(path);
    if (cached && cached.until > Date.now()) return cached.data;
    const pending = this.pending.get(path);
    if (pending) return pending;
    const work = (async () => {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        headers: { accept: "application/json", "X-CMC_PRO_API_KEY": this.key },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`CoinMarketCap returned ${response.status}`);
      const body = z
        .object({
          data: z.unknown(),
          status: z.object({
            error_code: z.coerce.number(),
            error_message: z.string().nullable().optional(),
          }),
        })
        .parse(await response.json());
      if (body.status.error_code !== 0)
        throw new Error(`CoinMarketCap error ${body.status.error_code}`);
      this.cache.set(path, { until: Date.now() + ttlMs, data: body.data });
      return body.data;
    })();
    this.pending.set(path, work);
    try {
      return await work;
    } finally {
      this.pending.delete(path);
    }
  }

  async rwaStocks(limit = 50): Promise<RwaMarket[]> {
    const data = z
      .object({ rwa_assets: z.array(rwaAsset) })
      .parse(
        await this.request(
          `/v5/real-world-assets/assets/list?asset_type=stock&limit=${Math.min(100, Math.max(1, limit))}&convert=USD`,
          60_000,
        ),
      );
    return data.rwa_assets.map(normalizeRwa);
  }

  async rwaDetail(
    symbol: string,
  ): Promise<{ market: RwaMarket | null; profile: RwaProfile | null }> {
    const ticker = symbol.toUpperCase();
    if (!/^[A-Z0-9$@.-]{1,15}$/.test(ticker)) throw new Error("Invalid asset symbol");
    const query = `symbol=${encodeURIComponent(ticker)}&skip_invalid=true`;
    const [quotes, info] = await Promise.allSettled([
      this.request(`/v5/real-world-assets/quotes/latest?${query}&convert=USD`, 60_000),
      this.request(`/v5/real-world-assets/info?${query}`, 60 * 60_000),
    ]);
    const parsedQuotes =
      quotes.status === "fulfilled"
        ? z.object({ rwa_assets: z.array(rwaAsset) }).safeParse(quotes.value)
        : null;
    const parsedInfo =
      info.status === "fulfilled"
        ? z.object({ rwa_assets: z.array(rwaInfo) }).safeParse(info.value)
        : null;
    const market = parsedQuotes?.success
      ? parsedQuotes.data.rwa_assets.find((asset) => asset.symbol.toUpperCase() === ticker)
      : null;
    const profile = parsedInfo?.success
      ? parsedInfo.data.rwa_assets.find((asset) => asset.symbol.toUpperCase() === ticker)
      : null;
    if (!market && !profile) throw new Error("CoinMarketCap asset not found");
    return {
      market: market ? normalizeRwa(market) : null,
      profile: profile
        ? {
            name: profile.name,
            symbol: profile.symbol,
            industry: profile.industry ?? null,
            employees: profile.employees ?? null,
            founded: profile.founded ?? null,
            website: profile.website ?? null,
            primaryExchange: profile.primary_exchange ?? null,
            description: profile.about?.description ?? null,
          }
        : null,
    };
  }

  async globalMetrics() {
    const data = z
      .object({
        btc_dominance: nullableNumber,
        eth_dominance: nullableNumber,
        active_cryptocurrencies: z.number().optional(),
        last_updated: z.string(),
        quote: z.object({
          USD: z.object({
            total_market_cap: nullableNumber,
            total_volume_24h: nullableNumber,
            altcoin_market_cap: nullableNumber,
            altcoin_volume_24h: nullableNumber,
          }),
        }),
      })
      .parse(await this.request("/v1/global-metrics/quotes/latest?convert=USD", 5 * 60_000));
    return {
      marketCapUsd: data.quote.USD.total_market_cap ?? null,
      volume24hUsd: data.quote.USD.total_volume_24h ?? null,
      altcoinMarketCapUsd: data.quote.USD.altcoin_market_cap ?? null,
      altcoinVolume24hUsd: data.quote.USD.altcoin_volume_24h ?? null,
      btcDominancePct: data.btc_dominance ?? null,
      ethDominancePct: data.eth_dominance ?? null,
      activeAssets: data.active_cryptocurrencies ?? null,
      updatedAt: data.last_updated,
    };
  }

  async tokenHistory(id: number, period: "hourly" | "daily" = "daily") {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid token id");
    const count = period === "hourly" ? 49 : 91;
    const data = z
      .object({
        id: z.number(),
        quotes: z.array(
          z.object({
            time_open: z.string(),
            quote: z.object({
              USD: z.object({
                open: z.number().finite(),
                high: z.number().finite(),
                low: z.number().finite(),
                close: z.number().finite(),
                volume: nullableNumber,
              }),
            }),
          }),
        ),
      })
      .parse(
        await this.request(
          `/v2/cryptocurrency/ohlcv/historical?id=${id}&time_period=${period}&count=${count}&convert=USD`,
          period === "hourly" ? 5 * 60_000 : 30 * 60_000,
        ),
      );
    return data.quotes.map((row) => ({
      time: row.time_open,
      open: row.quote.USD.open,
      high: row.quote.USD.high,
      low: row.quote.USD.low,
      close: row.quote.USD.close,
      volumeUsd: row.quote.USD.volume ?? null,
    }));
  }

  private normalizeDexCandles(input: unknown) {
    const payload =
      input && typeof input === "object" && "data" in input
        ? (input as { data: unknown }).data
        : input;
    const rows = z.array(z.array(z.coerce.number()).min(6)).parse(payload);
    return rows
      .flatMap((row) => {
        const [open, high, low, close, volume, timestamp] = row;
        if (
          open == null ||
          high == null ||
          low == null ||
          close == null ||
          timestamp == null ||
          ![open, high, low, close, timestamp].every(Number.isFinite) ||
          Math.min(open, high, low, close) <= 0 ||
          timestamp <= 0
        )
          return [];
        return [
          {
            time: new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toISOString(),
            open,
            high,
            low,
            close,
            volumeUsd: volume != null && Number.isFinite(volume) ? volume : null,
          },
        ];
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  async solanaTokenCandles(mint: string, interval: "1h" | "1d" = "1h") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))
      throw new Error("Invalid Solana token address");
    const key = `${mint}:${interval}`;
    const cached = this.dexCache.get(key);
    if (cached && cached.until > Date.now()) return cached.data;
    const query = new URLSearchParams({
      platform: "solana",
      address: mint,
      interval,
      unit: "usd",
      limit: "96",
      pm: "p",
    });
    const response = await this.fetcher(
      `https://pro-api.coinmarketcap.com/public-api/v1/k-line/candles?${query}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error(`Token chart returned ${response.status}`);
    const data = this.normalizeDexCandles(await response.json());
    this.dexCache.set(key, { until: Date.now() + 60_000, data });
    return data;
  }

  async sentiment() {
    const data = z
      .object({
        value: z.number().min(0).max(100),
        value_classification: z.string(),
        update_time: z.string(),
      })
      .parse(await this.request("/v3/fear-and-greed/latest", 15 * 60_000));
    return { score: data.value, label: data.value_classification, updatedAt: data.update_time };
  }

  async cryptoLeaders(limit = 12): Promise<CryptoMarket[]> {
    const data = z
      .array(cryptoListing)
      .parse(
        await this.request(
          `/v3/cryptocurrency/listings/latest?start=1&limit=${Math.min(50, Math.max(1, limit))}&convert=USD`,
          60_000,
        ),
      );
    return data.map((asset) => {
      const quote = asset.quote.find((item) => item.symbol === "USD");
      return {
        id: asset.id,
        name: asset.name,
        symbol: asset.symbol,
        rank: asset.cmc_rank ?? null,
        priceUsd: quote?.price ?? null,
        marketCapUsd: quote?.market_cap ?? null,
        volume24hUsd: quote?.volume_24h ?? null,
        dominancePct: quote?.market_cap_dominance ?? null,
        change1hPct: quote?.percent_change_1h ?? null,
        change24hPct: quote?.percent_change_24h ?? null,
        change7dPct: quote?.percent_change_7d ?? null,
        change30dPct: quote?.percent_change_30d ?? null,
        circulatingSupply: asset.circulating_supply ?? null,
        maxSupply: asset.max_supply ?? null,
        updatedAt: quote?.last_updated ?? asset.last_updated,
      };
    });
  }

  async cryptoProfile(id: number): Promise<CryptoProfile> {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid asset id");
    const data = z
      .record(
        z.string(),
        z.object({
          name: z.string(),
          symbol: z.string(),
          description: z.string().nullable().optional(),
          tags: z.array(z.string()).optional(),
          date_added: z.string().nullable().optional(),
          urls: z
            .object({
              website: z.array(z.string()).optional(),
              explorer: z.array(z.string()).optional(),
            })
            .optional(),
        }),
      )
      .parse(await this.request(`/v2/cryptocurrency/info?id=${id}`, 24 * 60 * 60_000));
    const asset = data[String(id)];
    if (!asset) throw new Error("Asset profile not found");
    return {
      name: asset.name,
      symbol: asset.symbol,
      description: asset.description ?? null,
      categories: asset.tags?.slice(0, 6) ?? [],
      launchedAt: asset.date_added ?? null,
      website: asset.urls?.website?.[0] ?? null,
      explorer: asset.urls?.explorer?.[0] ?? null,
    };
  }
}
