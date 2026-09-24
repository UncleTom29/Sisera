import type { Instrument, MarketSnapshot, PredictionMarket } from "@sisera/domain";
import { z } from "zod";

export class MarketDataUnavailableError extends Error {
  readonly code = "MARKET_DATA_UNAVAILABLE";
}

export interface MarketDataProvider {
  readonly id: string;
  getInstrument(symbol: string): Promise<Instrument>;
  getSnapshot(symbol: string): Promise<MarketSnapshot>;
}

type Fetch = typeof globalThis.fetch;

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

export class BinanceSpotProvider implements MarketDataProvider {
  readonly id = "binance-spot";

  constructor(
    private readonly baseUrl = "https://api.binance.com",
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

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

  private async request(path: string): Promise<unknown> {
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
}

const PolymarketEvent = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  endDate: z.string().nullish(),
  closed: z.boolean().optional(),
  markets: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      outcomes: z.union([z.array(z.string()), z.string()]),
      outcomePrices: z.union([z.array(z.string()), z.string()]),
      clobTokenIds: z.union([z.array(z.string()), z.string()]).optional(),
    }),
  ),
});

export class PolymarketProvider {
  constructor(
    private readonly baseUrl = "https://gamma-api.polymarket.com",
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

  async listOpenMarkets(limit = 20): Promise<PredictionMarket[]> {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.baseUrl}/events?active=true&closed=false&limit=${Math.min(limit, 100)}&order=volume&ascending=false`,
        { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } },
      );
    } catch {
      throw new MarketDataUnavailableError("Polymarket request failed");
    }
    if (!response.ok)
      throw new MarketDataUnavailableError(`Polymarket returned ${response.status}`);
    const events = z.array(PolymarketEvent).parse(await response.json());
    const receivedAt = new Date();
    return events.flatMap((event) => {
      const market = event.markets[0];
      if (!market) return [];
      const outcomes = parseStringArray(market.outcomes);
      const prices = parseStringArray(market.outcomePrices);
      const tokenIds = market.clobTokenIds ? parseStringArray(market.clobTokenIds) : [];
      return [
        {
          id: event.id,
          provider: "polymarket",
          title: event.title,
          closesAt: event.endDate ? new Date(event.endDate).toISOString() : null,
          status: event.closed ? "closed" : "open",
          outcomes: outcomes.map((label, index) => ({
            id: `${market.id}:${index}`,
            label,
            probability: prices[index] ?? "0",
            ...(tokenIds[index] ? { tokenId: tokenIds[index] } : {}),
          })),
          quality: {
            status: "live",
            source: "polymarket-gamma",
            observedAt: receivedAt.toISOString(),
            receivedAt: receivedAt.toISOString(),
            latencyMs: receivedAt.getTime() - startedAt,
          },
        } satisfies PredictionMarket,
      ];
    });
  }
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.replaceAll(/[\s/_-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(normalized)) throw new Error("Invalid market symbol");
  return normalized;
}

function readString(
  record: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = record?.[key];
  return typeof value === "string" ? value : fallback;
}

function parseStringArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value;
  const parsed: unknown = JSON.parse(value);
  return z.array(z.string()).parse(parsed);
}
