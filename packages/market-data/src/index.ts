import type {
  Candle,
  Instrument,
  MarketSnapshot,
  OrderBook,
  PredictionMarket,
} from "@sisera/domain";
import { z } from "zod";
import { MarketDataUnavailableError } from "./errors.js";

export { MarketDataUnavailableError } from "./errors.js";
export { PreStocksProvider, type PreStock } from "./prestocks.js";
export { FredMacroProvider, classifyMacro, type MacroRegime } from "./fred-macro.js";
export {
  PythProProvider,
  decimalFromMantissa,
  fairValue,
  parsePythReference,
  type PythReference,
} from "./pyth-pro.js";

export interface MarketDataProvider {
  readonly id: string;
  getInstrument(symbol: string): Promise<Instrument>;
  getSnapshot(symbol: string): Promise<MarketSnapshot>;
}

export type ReferenceMarket = {
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number | null;
  volume24hUsd: number | null;
  observedAt: string;
  source: "coingecko";
};

const referenceIds: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  BNBUSDT: "binancecoin",
  XRPUSDT: "ripple",
  DOGEUSDT: "dogecoin",
  ADAUSDT: "cardano",
  AVAXUSDT: "avalanche-2",
  LINKUSDT: "chainlink",
  SUIUSDT: "sui",
  LTCUSDT: "litecoin",
  TRXUSDT: "tron",
};

const CoinGeckoMarket = z.object({
  id: z.string(),
  name: z.string(),
  current_price: z.number().positive().nullable(),
  price_change_percentage_24h: z.number().nullable(),
  total_volume: z.number().nonnegative().nullable(),
  last_updated: z.string().datetime(),
});

export class CoinGeckoReferenceProvider {
  private cache: { symbols: string[]; until: number; rows: ReferenceMarket[] } | null = null;

  constructor(
    private readonly baseUrl = "https://api.coingecko.com",
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

  async list(symbols: readonly string[]): Promise<ReferenceMarket[]> {
    const requested = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].filter(
      (symbol) => referenceIds[symbol],
    );
    if (requested.length === 0) return [];
    if (
      this.cache &&
      this.cache.until > Date.now() &&
      requested.every((symbol) => this.cache?.symbols.includes(symbol))
    ) {
      const bySymbol = new Map(this.cache.rows.map((row) => [row.symbol, row]));
      return requested.flatMap((symbol) => {
        const row = bySymbol.get(symbol);
        return row ? [row] : [];
      });
    }
    const ids = requested.map((symbol) => referenceIds[symbol]);
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.baseUrl}/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}&price_change_percentage=24h`,
        { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) },
      );
    } catch {
      throw new MarketDataUnavailableError("CoinGecko reference data request failed");
    }
    if (!response.ok) throw new MarketDataUnavailableError(`CoinGecko returned ${response.status}`);
    const payload = z.array(CoinGeckoMarket).parse(await response.json());
    const byId = new Map(payload.map((row) => [row.id, row]));
    const rows = requested.flatMap((symbol) => {
      const market = byId.get(referenceIds[symbol] ?? "");
      if (!market?.current_price) return [];
      return [
        {
          symbol,
          name: market.name,
          priceUsd: market.current_price,
          change24hPct: market.price_change_percentage_24h,
          volume24hUsd: market.total_volume,
          observedAt: market.last_updated,
          source: "coingecko" as const,
        },
      ];
    });
    this.cache = { symbols: requested, until: Date.now() + 60_000, rows };
    return rows;
  }
}

type Fetch = typeof globalThis.fetch;

const HyperliquidMeta = z.tuple([
  z.object({
    universe: z.array(
      z.object({
        name: z.string(),
        szDecimals: z.number().int(),
        isDelisted: z.boolean().optional(),
      }),
    ),
  }),
  z.array(
    z.object({
      markPx: z.string().optional(),
      midPx: z.string().nullish(),
      prevDayPx: z.string().optional(),
      dayNtlVlm: z.string().optional(),
      funding: z.string().optional(),
      openInterest: z.string().optional(),
      oraclePx: z.string().optional(),
    }),
  ),
]);
const HyperliquidBook = z.object({
  coin: z.string(),
  time: z.number().int(),
  levels: z.tuple([
    z.array(z.object({ px: z.string(), sz: z.string() })),
    z.array(z.object({ px: z.string(), sz: z.string() })),
  ]),
});
const HyperliquidCandles = z.array(
  z.object({
    t: z.number().int(),
    o: z.string(),
    h: z.string(),
    l: z.string(),
    c: z.string(),
    v: z.string(),
  }),
);

export type PerpetualMetric = {
  symbol: string;
  markPrice: string;
  oraclePrice: string | null;
  fundingRate: string | null;
  openInterestBase: string | null;
  volume24hUsd: string | null;
  observedAt: string;
  source: "hyperliquid-perps";
};

const HyperliquidAccountState = z.object({
  marginSummary: z.object({
    accountValue: z.string(),
    totalNtlPos: z.string(),
    totalMarginUsed: z.string(),
  }),
  withdrawable: z.string(),
  assetPositions: z.array(
    z.object({
      position: z.object({
        coin: z.string(),
        szi: z.string(),
        entryPx: z.string(),
        positionValue: z.string(),
        unrealizedPnl: z.string(),
        marginUsed: z.string(),
        liquidationPx: z.string().nullish(),
        leverage: z.object({ type: z.string(), value: z.number() }),
      }),
    }),
  ),
});

export type PublicPerpAccount = {
  address: string;
  accountValue: string;
  notionalExposure: string;
  marginUsed: string;
  withdrawable: string;
  positions: Array<{
    coin: string;
    size: string;
    entryPrice: string;
    notional: string;
    unrealizedPnl: string;
    marginUsed: string;
    liquidationPrice: string | null;
    leverage: number;
    marginType: string;
  }>;
  fetchedAt: string;
  source: "hyperliquid-clearinghouse";
};

export class HyperliquidPerpProvider implements MarketDataProvider {
  readonly id = "hyperliquid-perps";
  private metadata: { until: number; value: z.infer<typeof HyperliquidMeta> } | null = null;
  private metadataRequest: Promise<z.infer<typeof HyperliquidMeta>> | null = null;

  constructor(
    private readonly baseUrl = "https://api.hyperliquid.xyz",
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

  async listMarkets(
    symbols: readonly string[],
  ): Promise<Array<{ instrument: Instrument; snapshot: MarketSnapshot }>> {
    const requested = [...new Set(symbols.map(perpCoin))].slice(0, 20);
    const metadata = await this.getMetadata();
    const available = requested.filter((coin) =>
      metadata[0].universe.some((asset) => asset.name === coin && !asset.isDelisted),
    );
    const results = await Promise.allSettled(
      available.map(async (coin) => ({
        instrument: this.instrumentFromMetadata(coin, metadata),
        snapshot: await this.snapshotFromMetadata(coin, metadata),
      })),
    );
    return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  }

  async getInstrument(symbol: string): Promise<Instrument> {
    return this.instrumentFromMetadata(perpCoin(symbol), await this.getMetadata());
  }

  async getSnapshot(symbol: string): Promise<MarketSnapshot> {
    const coin = perpCoin(symbol);
    return this.snapshotFromMetadata(coin, await this.getMetadata());
  }

  async getOrderBook(symbol: string, limit = 20): Promise<OrderBook> {
    const coin = perpCoin(symbol);
    const startedAt = Date.now();
    const book = HyperliquidBook.parse(await this.request({ type: "l2Book", coin }));
    if (book.coin !== coin || !book.levels[0][0] || !book.levels[1][0])
      throw new MarketDataUnavailableError(`Hyperliquid depth unavailable for ${coin}`);
    const receivedAt = new Date().toISOString();
    return {
      instrumentId: `hyperliquid:${coin}:perpetual`,
      sequence: String(book.time),
      bids: book.levels[0]
        .slice(0, limit)
        .map((level) => ({ price: level.px, quantity: level.sz })),
      asks: book.levels[1]
        .slice(0, limit)
        .map((level) => ({ price: level.px, quantity: level.sz })),
      quality: {
        status: "live",
        source: this.id,
        observedAt: new Date(book.time).toISOString(),
        receivedAt,
        latencyMs: Date.now() - startedAt,
        sequence: String(book.time),
      },
    };
  }

  async getCandles(symbol: string, interval = "15m", limit = 240): Promise<Candle[]> {
    const coin = perpCoin(symbol);
    const duration = intervalDuration(interval);
    const endTime = Date.now();
    const startTime = endTime - duration * Math.min(Math.max(limit, 30), 500) - duration;
    const payload = HyperliquidCandles.parse(
      await this.request({ type: "candleSnapshot", req: { coin, interval, startTime, endTime } }),
    );
    return payload.slice(-limit).map((row) => ({
      time: Math.floor(row.t / 1000),
      open: row.o,
      high: row.h,
      low: row.l,
      close: row.c,
      volume: row.v,
    }));
  }

  async listPerpetualMetrics(symbols: readonly string[]): Promise<PerpetualMetric[]> {
    const metadata = await this.getMetadata();
    const observedAt = new Date().toISOString();
    return [...new Set(symbols.map(perpCoin))].flatMap((coin) => {
      const index = metadata[0].universe.findIndex(
        (asset) => asset.name === coin && !asset.isDelisted,
      );
      const context = metadata[1][index];
      if (index < 0 || !context?.markPx) return [];
      return [
        {
          symbol: coin,
          markPrice: context.markPx,
          oraclePrice: context.oraclePx ?? null,
          fundingRate: context.funding ?? null,
          openInterestBase: context.openInterest ?? null,
          volume24hUsd: context.dayNtlVlm ?? null,
          observedAt,
          source: "hyperliquid-perps" as const,
        },
      ];
    });
  }

  async getPublicAccount(address: string): Promise<PublicPerpAccount> {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Invalid public wallet address");
    const payload = HyperliquidAccountState.parse(
      await this.request({ type: "clearinghouseState", user: address }),
    );
    return {
      address,
      accountValue: payload.marginSummary.accountValue,
      notionalExposure: payload.marginSummary.totalNtlPos,
      marginUsed: payload.marginSummary.totalMarginUsed,
      withdrawable: payload.withdrawable,
      positions: payload.assetPositions.map(({ position }) => ({
        coin: position.coin,
        size: position.szi,
        entryPrice: position.entryPx,
        notional: position.positionValue,
        unrealizedPnl: position.unrealizedPnl,
        marginUsed: position.marginUsed,
        liquidationPrice: position.liquidationPx ?? null,
        leverage: position.leverage.value,
        marginType: position.leverage.type,
      })),
      fetchedAt: new Date().toISOString(),
      source: "hyperliquid-clearinghouse",
    };
  }

  private instrumentFromMetadata(
    coin: string,
    metadata: z.infer<typeof HyperliquidMeta>,
  ): Instrument {
    const asset = metadata[0].universe.find((item) => item.name === coin && !item.isDelisted);
    if (!asset) throw new MarketDataUnavailableError(`Unknown Hyperliquid perpetual ${coin}`);
    return {
      id: `hyperliquid:${coin}:perpetual`,
      venue: "hyperliquid",
      venueSymbol: coin,
      displaySymbol: `${coin} / USDC`,
      assetClass: "crypto",
      type: "perpetual",
      baseAsset: coin,
      quoteAsset: "USDC",
      priceIncrement: "0.00000001",
      quantityIncrement: decimalIncrement(asset.szDecimals),
      contractMultiplier: "1",
      status: "active",
    };
  }

  private async snapshotFromMetadata(
    coin: string,
    metadata: z.infer<typeof HyperliquidMeta>,
  ): Promise<MarketSnapshot> {
    const index = metadata[0].universe.findIndex(
      (asset) => asset.name === coin && !asset.isDelisted,
    );
    const context = metadata[1][index];
    if (index < 0 || !context?.markPx)
      throw new MarketDataUnavailableError(`Hyperliquid mark unavailable for ${coin}`);
    const book = await this.getOrderBook(coin);
    const bid = book.bids[0]?.price;
    const ask = book.asks[0]?.price;
    if (!bid || !ask)
      throw new MarketDataUnavailableError(`Hyperliquid quote unavailable for ${coin}`);
    const previous = Number(context.prevDayPx);
    const change =
      previous > 0 ? ((Number(context.markPx) / previous - 1) * 100).toFixed(4) : undefined;
    return {
      instrumentId: `hyperliquid:${coin}:perpetual`,
      bid,
      ask,
      last: context.markPx,
      ...(change ? { change24hPct: change } : {}),
      ...(context.dayNtlVlm ? { volume24h: context.dayNtlVlm } : {}),
      quality: book.quality,
    };
  }

  private async getMetadata(): Promise<z.infer<typeof HyperliquidMeta>> {
    if (this.metadata && this.metadata.until > Date.now()) return this.metadata.value;
    if (!this.metadataRequest) {
      this.metadataRequest = this.request({ type: "metaAndAssetCtxs" })
        .then((payload) => {
          const value = HyperliquidMeta.parse(payload);
          this.metadata = { until: Date.now() + 5000, value };
          return value;
        })
        .finally(() => {
          this.metadataRequest = null;
        });
    }
    return this.metadataRequest;
  }

  private async request(body: object): Promise<unknown> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/info`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok)
        throw new MarketDataUnavailableError(`Hyperliquid returned ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof MarketDataUnavailableError) throw error;
      throw new MarketDataUnavailableError("Hyperliquid market data request failed");
    }
  }
}

const DeFiLlamaChain = z.object({
  name: z.string(),
  tvl: z.number().nonnegative(),
  tokenSymbol: z.string().nullish(),
  chainId: z.union([z.string(), z.number()]).nullish(),
});

export type ChainTvl = {
  name: string;
  tvlUsd: number;
  tokenSymbol: string | null;
  chainId: string | null;
  observedAt: string;
  source: "defillama";
};

export class DeFiLlamaChainProvider {
  private cache: { until: number; rows: ChainTvl[] } | null = null;

  constructor(
    private readonly baseUrl = "https://api.llama.fi",
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

  async listChains(limit = 20): Promise<ChainTvl[]> {
    if (this.cache && this.cache.until > Date.now()) return this.cache.rows.slice(0, limit);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/v2/chains`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      throw new MarketDataUnavailableError("DeFiLlama chain TVL request failed");
    }
    if (!response.ok) throw new MarketDataUnavailableError(`DeFiLlama returned ${response.status}`);
    const payload = z.array(DeFiLlamaChain).parse(await response.json());
    const observedAt = new Date().toISOString();
    const rows = payload
      .filter((chain) => chain.tvl > 0)
      .sort((left, right) => right.tvl - left.tvl)
      .map((chain) => ({
        name: chain.name,
        tvlUsd: chain.tvl,
        tokenSymbol: chain.tokenSymbol ?? null,
        chainId: chain.chainId == null ? null : String(chain.chainId),
        observedAt,
        source: "defillama" as const,
      }));
    this.cache = { until: Date.now() + 60_000, rows };
    return rows.slice(0, limit);
  }
}

function perpCoin(symbol: string): string {
  const coin = symbol.toUpperCase().replace(/USDT$|USDC$|-USD$/, "");
  if (!/^[A-Z0-9]{2,12}$/.test(coin)) throw new Error("Invalid perpetual symbol");
  return coin;
}

function intervalDuration(interval: string): number {
  const durations: Record<string, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
  };
  const duration = durations[interval];
  if (!duration) throw new Error("Unsupported Hyperliquid interval");
  return duration;
}

function decimalIncrement(decimals: number): string {
  return decimals === 0 ? "1" : `0.${"0".repeat(decimals - 1)}1`;
}

const BinanceBookTicker = z.object({
  symbol: z.string(),
  bidPrice: z.string(),
  askPrice: z.string(),
});
const BinanceTicker = z.object({
  lastPrice: z.string(),
  priceChangePercent: z.string(),
  quoteVolume: z.string(),
});
const BinanceBatchTicker = BinanceTicker.extend({ symbol: z.string() });
const BinanceExchangeInfo = z.object({
  symbols: z.array(
    z.object({
      symbol: z.string(),
      baseAsset: z.string(),
      quoteAsset: z.string(),
      status: z.string(),
      filters: z.array(z.record(z.unknown())),
    }),
  ),
});
const BinanceKlines = z.array(z.array(z.union([z.string(), z.number()])).min(6));
const BinanceDepth = z.object({
  lastUpdateId: z.number(),
  bids: z.array(z.tuple([z.string(), z.string()])),
  asks: z.array(z.tuple([z.string(), z.string()])),
});

export class BinanceSpotProvider implements MarketDataProvider {
  readonly id = "binance-spot";
  private healthyUntil = 0;
  private unavailableUntil = 0;
  private probe: Promise<void> | null = null;

  constructor(
    private readonly baseUrl = "https://data-api.binance.vision",
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

  async listMarkets(
    symbols: readonly string[],
  ): Promise<Array<{ instrument: Instrument; snapshot: MarketSnapshot }>> {
    const requested = [...new Set(symbols.map(normalizeSymbol))].slice(0, 20);
    if (requested.length === 0) return [];
    const query = `symbols=${encodeURIComponent(JSON.stringify(requested))}`;
    const startedAt = Date.now();
    const [infoPayload, bookPayload, tickerPayload] = await Promise.all([
      this.request(`/api/v3/exchangeInfo?${query}`),
      this.request(`/api/v3/ticker/bookTicker?${query}`),
      this.request(`/api/v3/ticker/24hr?${query}`),
    ]);
    const info = BinanceExchangeInfo.parse(infoPayload);
    const books = new Map(
      z
        .array(BinanceBookTicker)
        .parse(bookPayload)
        .map((row) => [row.symbol, row]),
    );
    const tickers = new Map(
      z
        .array(BinanceBatchTicker)
        .parse(tickerPayload)
        .map((row) => [row.symbol, row]),
    );
    const instruments = new Map(info.symbols.map((market) => [market.symbol, market]));
    const receivedAt = new Date();
    return requested.flatMap((symbol) => {
      const market = instruments.get(symbol);
      const book = books.get(symbol);
      const ticker = tickers.get(symbol);
      if (!market || !book || !ticker) return [];
      const priceFilter = market.filters.find((filter) => filter.filterType === "PRICE_FILTER");
      const lotFilter = market.filters.find((filter) => filter.filterType === "LOT_SIZE");
      return [
        {
          instrument: {
            id: `binance:${symbol}:spot`,
            venue: "binance",
            venueSymbol: symbol,
            displaySymbol: `${market.baseAsset} / ${market.quoteAsset}`,
            assetClass: "crypto" as const,
            type: "spot" as const,
            baseAsset: market.baseAsset,
            quoteAsset: market.quoteAsset,
            priceIncrement: readString(priceFilter, "tickSize", "0.00000001"),
            quantityIncrement: readString(lotFilter, "stepSize", "0.00000001"),
            contractMultiplier: "1",
            status: market.status === "TRADING" ? ("active" as const) : ("halted" as const),
          },
          snapshot: {
            instrumentId: `binance:${symbol}:spot`,
            bid: book.bidPrice,
            ask: book.askPrice,
            last: ticker.lastPrice,
            change24hPct: ticker.priceChangePercent,
            volume24h: ticker.quoteVolume,
            quality: {
              status: "live" as const,
              source: this.id,
              observedAt: receivedAt.toISOString(),
              receivedAt: receivedAt.toISOString(),
              latencyMs: receivedAt.getTime() - startedAt,
            },
          },
        },
      ];
    });
  }

  async getInstrument(symbol: string): Promise<Instrument> {
    const normalized = normalizeSymbol(symbol);
    const payload = await this.request(
      `/api/v3/exchangeInfo?symbol=${encodeURIComponent(normalized)}`,
    );
    const parsed = BinanceExchangeInfo.safeParse(payload);
    const market = parsed.success ? parsed.data.symbols[0] : undefined;
    if (!market) throw new MarketDataUnavailableError(`Unknown Binance symbol ${normalized}`);
    const priceFilter = market.filters.find((filter) => filter.filterType === "PRICE_FILTER");
    const lotFilter = market.filters.find((filter) => filter.filterType === "LOT_SIZE");
    return {
      id: `binance:${market.symbol}:spot`,
      venue: "binance",
      venueSymbol: market.symbol,
      displaySymbol: `${market.baseAsset} / ${market.quoteAsset}`,
      assetClass: "crypto",
      type: "spot",
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      priceIncrement: readString(priceFilter, "tickSize", "0.00000001"),
      quantityIncrement: readString(lotFilter, "stepSize", "0.00000001"),
      contractMultiplier: "1",
      status: market.status === "TRADING" ? "active" : "halted",
    };
  }

  async getSnapshot(symbol: string): Promise<MarketSnapshot> {
    const normalized = normalizeSymbol(symbol);
    const startedAt = Date.now();
    const [bookPayload, tickerPayload] = await Promise.all([
      this.request(`/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(normalized)}`),
      this.request(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(normalized)}`),
    ]);
    const book = BinanceBookTicker.parse(bookPayload);
    const ticker = BinanceTicker.parse(tickerPayload);
    const receivedAt = new Date();
    return {
      instrumentId: `binance:${book.symbol}:spot`,
      bid: book.bidPrice,
      ask: book.askPrice,
      last: ticker.lastPrice,
      change24hPct: ticker.priceChangePercent,
      volume24h: ticker.quoteVolume,
      quality: {
        status: "live",
        source: this.id,
        observedAt: receivedAt.toISOString(),
        receivedAt: receivedAt.toISOString(),
        latencyMs: receivedAt.getTime() - startedAt,
      },
    };
  }

  async getCandles(symbol: string, interval = "15m", limit = 240): Promise<Candle[]> {
    const normalized = normalizeSymbol(symbol);
    if (!/^(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)$/.test(interval)) {
      throw new Error("Invalid candle interval");
    }
    const payload = BinanceKlines.parse(
      await this.request(
        `/api/v3/klines?symbol=${encodeURIComponent(normalized)}&interval=${interval}&limit=${Math.min(Math.max(limit, 10), 1000)}`,
      ),
    );
    return payload.map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: String(row[1]),
      high: String(row[2]),
      low: String(row[3]),
      close: String(row[4]),
      volume: String(row[5]),
    }));
  }

  async getOrderBook(symbol: string, limit = 20): Promise<OrderBook> {
    const normalized = normalizeSymbol(symbol);
    const startedAt = Date.now();
    const depth = BinanceDepth.parse(
      await this.request(
        `/api/v3/depth?symbol=${encodeURIComponent(normalized)}&limit=${normalizeDepth(limit)}`,
      ),
    );
    const receivedAt = new Date();
    return {
      instrumentId: `binance:${normalized}:spot`,
      sequence: String(depth.lastUpdateId),
      bids: depth.bids.map(([price, quantity]) => ({ price, quantity })),
      asks: depth.asks.map(([price, quantity]) => ({ price, quantity })),
      quality: {
        status: "live",
        source: this.id,
        observedAt: receivedAt.toISOString(),
        receivedAt: receivedAt.toISOString(),
        latencyMs: receivedAt.getTime() - startedAt,
        sequence: String(depth.lastUpdateId),
      },
    };
  }

  private async request(path: string): Promise<unknown> {
    await this.ensureAvailable();
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        headers: { accept: "application/json", "user-agent": "sisera-market-data/0.2" },
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new MarketDataUnavailableError(`Binance returned ${response.status}`);
      return response.json();
    } catch (error) {
      if (error instanceof MarketDataUnavailableError) throw error;
      throw new MarketDataUnavailableError("Binance market data request failed");
    }
  }

  private async ensureAvailable(): Promise<void> {
    if (Date.now() < this.unavailableUntil)
      throw new MarketDataUnavailableError("Binance market data is temporarily unavailable");
    if (Date.now() < this.healthyUntil) return;
    if (!this.probe) {
      this.probe = (async () => {
        try {
          const response = await this.fetcher(`${this.baseUrl}/api/v3/ping`, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(2500),
          });
          if (!response.ok)
            throw new MarketDataUnavailableError(`Binance returned ${response.status}`);
          this.healthyUntil = Date.now() + 30_000;
        } catch {
          this.unavailableUntil = Date.now() + 10_000;
          throw new MarketDataUnavailableError("Binance market data is temporarily unavailable");
        } finally {
          this.probe = null;
        }
      })();
    }
    await this.probe;
  }
}

/** Jupiter discovery is read-only; orders require a separate user-signed transaction. */
export class JupiterPredictionProvider {
  private cache: { until: number; markets: PredictionMarket[] } | null = null;
  private pending: Promise<PredictionMarket[]> | null = null;

  constructor(
    private readonly baseUrl = "https://api.jup.ag/prediction/v1",
    private readonly apiKey?: string,
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

  async listOpenMarkets(limit = 20): Promise<PredictionMarket[]> {
    if (this.cache && this.cache.until > Date.now()) return this.cache.markets.slice(0, limit);
    this.pending ??= this.loadMarkets().finally(() => {
      this.pending = null;
    });
    return (await this.pending).slice(0, limit);
  }

  private async loadMarkets(): Promise<PredictionMarket[]> {
    const startedAt = Date.now();
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/events`);
    url.searchParams.set("includeMarkets", "true");
    url.searchParams.set("start", "0");
    url.searchParams.set("end", "9");
    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        headers: {
          accept: "application/json",
          ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new MarketDataUnavailableError("Jupiter prediction events request failed");
    }
    if (!response.ok) throw new MarketDataUnavailableError(`Jupiter returned ${response.status}`);
    const payload = (await response.json()) as unknown;
    const records =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>).data : null;
    if (!Array.isArray(records))
      throw new MarketDataUnavailableError("Unrecognized Jupiter events response");
    const receivedAt = new Date().toISOString();
    const markets = records.flatMap((event): PredictionMarket[] => {
      if (!event || typeof event !== "object") return [];
      const row = event as Record<string, unknown>;
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      const eventTitle = typeof metadata.title === "string" ? metadata.title : "";
      if (!Array.isArray(row.markets)) return [];
      return row.markets.flatMap((raw): PredictionMarket[] => {
        if (!raw || typeof raw !== "object") return [];
        const market = raw as Record<string, unknown>;
        if (typeof market.marketId !== "string" || market.status !== "open") return [];
        const pricing =
          market.pricing && typeof market.pricing === "object"
            ? (market.pricing as Record<string, unknown>)
            : {};
        const yes = Number(pricing.buyYesPriceUsd) / 1_000_000;
        const no = Number(pricing.buyNoPriceUsd) / 1_000_000;
        const sellYes = Number(pricing.sellYesPriceUsd) / 1_000_000;
        const sellNo = Number(pricing.sellNoPriceUsd) / 1_000_000;
        if (![yes, no].every((price) => Number.isFinite(price) && price > 0 && price <= 1))
          return [];
        const close = Number(market.closeTime);
        const closesAt =
          Number.isFinite(close) && close > 0 ? new Date(close * 1000).toISOString() : null;
        const marketTitle = typeof market.title === "string" ? market.title : "";
        return [
          {
            id: market.marketId,
            provider: "jupiter",
            underlyingProvider: typeof market.provider === "string" ? market.provider : null,
            title:
              marketTitle && marketTitle !== eventTitle
                ? `${eventTitle} · ${marketTitle}`
                : eventTitle || marketTitle,
            category: typeof row.category === "string" ? row.category : null,
            resolutionRules: typeof market.rulesPrimary === "string" ? market.rulesPrimary : null,
            closesAt,
            status: "open",
            outcomes: [
              {
                id: `${market.marketId}:yes`,
                label: "YES",
                probability: String(yes),
                ...(Number.isFinite(sellYes) && sellYes > 0 && sellYes <= yes
                  ? { sellPrice: String(sellYes) }
                  : {}),
              },
              {
                id: `${market.marketId}:no`,
                label: "NO",
                probability: String(no),
                ...(Number.isFinite(sellNo) && sellNo > 0 && sellNo <= no
                  ? { sellPrice: String(sellNo) }
                  : {}),
              },
            ],
            quality: {
              status: "delayed",
              source: "jupiter-prediction-api",
              observedAt: receivedAt,
              receivedAt,
              latencyMs: Date.now() - startedAt,
            },
          },
        ];
      });
    });
    this.cache = { until: Date.now() + 30_000, markets };
    return markets;
  }
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.replaceAll(/[\s/_-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(normalized)) throw new Error("Invalid market symbol");
  return normalized;
}

function normalizeDepth(limit: number): number {
  const permitted = [5, 10, 20, 50, 100, 500, 1000];
  return permitted.find((candidate) => candidate >= limit) ?? 1000;
}

function readString(
  record: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = record?.[key];
  return typeof value === "string" ? value : fallback;
}
