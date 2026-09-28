import { z } from "zod";

const Chart = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string(),
            currency: z.string(),
            regularMarketPrice: z.number().positive(),
            regularMarketTime: z.number().int().positive(),
          }),
        }),
      )
      .nullable(),
  }),
});
const NasdaqQuote = z.object({
  data: z.object({
    symbol: z.string(),
    primaryData: z.object({
      lastSalePrice: z.string(),
      lastTradeTimestamp: z.string(),
    }),
  }),
});

export type PublicEquityReference = {
  symbol: string;
  price: string;
  confidence: null;
  marketSession: null;
  feedUpdateTimestamp: string;
  referenceFreshness: "live" | "carried_forward" | "stale";
  ageMs: number;
  source: "public-equity";
};

export class PublicEquityReferenceClient {
  private cache = new Map<string, { until: number; value: PublicEquityReference }>();
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async getLatest(rawSymbol: string): Promise<PublicEquityReference> {
    const ticker = rawSymbol
      .toUpperCase()
      .replace(/^EQUITY\.US\./, "")
      .replace(/\/USD$/, "");
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) throw new Error("Invalid equity ticker");
    const cached = this.cache.get(ticker);
    if (cached && cached.until > Date.now()) return cached.value;
    let price: number;
    let timestamp: number;
    try {
      const response = await this.fetcher(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
        {
          headers: { accept: "application/json", "user-agent": "Mozilla/5.0 Sisera/1.0" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error(`Public equity quote returned ${response.status}`);
      const result = Chart.parse(await response.json()).chart.result?.[0];
      if (!result || result.meta.currency !== "USD" || result.meta.symbol.toUpperCase() !== ticker)
        throw new Error("Public equity quote did not match the ticker");
      price = result.meta.regularMarketPrice;
      timestamp = result.meta.regularMarketTime * 1000;
    } catch {
      const response = await this.fetcher(
        `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/info?assetclass=stocks`,
        {
          headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error(`Public equity backup returned ${response.status}`);
      const result = NasdaqQuote.parse(await response.json()).data;
      if (result.symbol.toUpperCase() !== ticker)
        throw new Error("Public equity backup did not match the ticker");
      price = Number(result.primaryData.lastSalePrice.replace(/[$,]/g, ""));
      timestamp = Date.parse(result.primaryData.lastTradeTimestamp);
    }
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(timestamp) ||
      timestamp > Date.now() + 60_000
    )
      throw new Error("Public equity quote is invalid");
    const ageMs = Math.max(0, Date.now() - timestamp);
    const value: PublicEquityReference = {
      symbol: `EQUITY.US.${ticker}/USD`,
      price: String(price),
      confidence: null,
      marketSession: null,
      feedUpdateTimestamp: new Date(timestamp).toISOString(),
      referenceFreshness:
        ageMs <= 60_000 ? "live" : ageMs <= 7 * 24 * 60 * 60_000 ? "carried_forward" : "stale",
      ageMs,
      source: "public-equity",
    };
    this.cache.set(ticker, { until: Date.now() + 5 * 60_000, value });
    return value;
  }

  async getLatestEquities(symbols: readonly string[]): Promise<PublicEquityReference[]> {
    const unique = [...new Set(symbols)].slice(0, 40);
    const results = await Promise.allSettled(unique.map((symbol) => this.getLatest(symbol)));
    return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  }
}
