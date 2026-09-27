import { z } from "zod";

const FeedMetadata = z.object({
  id: z.string().regex(/^(?:0x)?[0-9a-fA-F]{64}$/),
  attributes: z.object({
    symbol: z.string(),
    asset_type: z.string().optional(),
  }),
});
const Price = z.object({
  price: z.string().regex(/^-?\d+$/),
  conf: z.string().regex(/^\d+$/),
  expo: z.number().int().min(-18).max(18),
  publish_time: z.number().int().nonnegative(),
});
const Latest = z.object({
  parsed: z.array(z.object({ id: z.string(), price: Price })),
});

export type PythReference = {
  symbol: string;
  feedId: string;
  price: string;
  confidence: string | null;
  marketSession: null;
  feedUpdateTimestamp: string;
  referenceFreshness: "live" | "stale";
  ageMs: number;
  source: "pyth-core";
};

export function decimalFromMantissa(value: string | number, exponent: number): string {
  const integer = BigInt(value);
  const negative = integer < 0n;
  const digits = (negative ? -integer : integer).toString();
  if (exponent >= 0) return `${negative ? "-" : ""}${digits}${"0".repeat(exponent)}`;
  const position = digits.length + exponent;
  const padded =
    position > 0
      ? `${digits.slice(0, position)}.${digits.slice(position)}`
      : `0.${"0".repeat(-position)}${digits}`;
  return `${negative ? "-" : ""}${padded.replace(/0+$/, "").replace(/\.$/, "")}`;
}

const normalizeFeedId = (id: string) => id.replace(/^0x/i, "").toLowerCase();

export function parsePythReference(
  payload: unknown,
  symbol: string,
  feedId: string,
  now = Date.now(),
): PythReference {
  const response = Latest.parse(payload);
  const feed = response.parsed.find((item) => normalizeFeedId(item.id) === normalizeFeedId(feedId));
  if (!feed) throw new Error(`Pyth Core feed unavailable for ${symbol}`);
  const observedAt = feed.price.publish_time * 1000;
  if (observedAt > now + 60_000) throw new Error("Pyth Core feed timestamp is in the future");
  const ageMs = Math.max(0, now - observedAt);
  const price = decimalFromMantissa(feed.price.price, feed.price.expo);
  if (Number(price) <= 0) throw new Error(`Pyth Core price invalid for ${symbol}`);
  return {
    symbol,
    feedId: `0x${normalizeFeedId(feedId)}`,
    price,
    confidence: decimalFromMantissa(feed.price.conf, feed.price.expo),
    marketSession: null,
    feedUpdateTimestamp: new Date(observedAt).toISOString(),
    referenceFreshness: ageMs <= 60_000 ? "live" : "stale",
    ageMs,
    source: "pyth-core",
  };
}

export function fairValue(
  tokenPrice: string,
  reference: PythReference,
  history?: { meanPct: number; standardDeviationPct: number },
) {
  const premiumDiscountPct = (Number(tokenPrice) / Number(reference.price) - 1) * 100;
  if (!Number.isFinite(premiumDiscountPct)) throw new Error("Invalid fair-value inputs");
  return {
    referencePrice: reference.price,
    tokenPrice,
    premiumDiscountPct: String(premiumDiscountPct),
    premiumDiscountBps: String(premiumDiscountPct * 100),
    confidence: reference.confidence,
    referenceFreshness: reference.referenceFreshness,
    marketSession: reference.marketSession,
    divergenceZScore:
      history && history.standardDeviationPct > 0
        ? String((premiumDiscountPct - history.meanPct) / history.standardDeviationPct)
        : null,
    executable: false,
  };
}

export class PythCoreProvider {
  private metadata: { until: number; bySymbol: Map<string, z.infer<typeof FeedMetadata>> } | null =
    null;
  private latest: { key: string; until: number; value: PythReference[] } | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://pyth.dourolabs.app/hermes",
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  private async equityFeeds() {
    if (this.metadata && this.metadata.until > Date.now()) return this.metadata.bySymbol;
    const response = await this.fetcher(`${this.baseUrl}/v2/price_feeds?asset_type=equity`, {
      headers: { accept: "application/json", authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Pyth Core feed catalogue returned ${response.status}`);
    const feeds = z.array(FeedMetadata).parse(await response.json());
    const bySymbol = new Map<string, z.infer<typeof FeedMetadata>>();
    for (const feed of feeds) {
      if (feed.attributes.asset_type?.toLowerCase() !== "equity") continue;
      bySymbol.set(feed.attributes.symbol.toUpperCase(), feed);
    }
    this.metadata = { until: Date.now() + 60 * 60_000, bySymbol };
    return bySymbol;
  }

  async getLatest(symbol: string): Promise<PythReference> {
    const [reference] = await this.getLatestEquities([symbol]);
    if (!reference) throw new Error(`Pyth Core feed unavailable for ${symbol}`);
    return reference;
  }

  async getLatestEquities(tickers: readonly string[]): Promise<PythReference[]> {
    if (!this.apiKey) throw new Error("Pyth Core Hermes API key is not configured");
    const unique = [
      ...new Set(
        tickers.map((ticker) =>
          ticker
            .toUpperCase()
            .replace(/^EQUITY\.US\./, "")
            .replace(/\/USD$/, ""),
        ),
      ),
    ]
      .filter((ticker) => /^[A-Z0-9.-]{1,12}$/.test(ticker))
      .slice(0, 40);
    if (!unique.length) return [];
    const feeds = await this.equityFeeds();
    const selected = unique.flatMap((ticker) => {
      const symbol = `EQUITY.US.${ticker}/USD`;
      const feed = feeds.get(symbol);
      return feed ? [{ symbol: feed.attributes.symbol, id: feed.id }] : [];
    });
    if (!selected.length) return [];
    const key = selected.map((feed) => normalizeFeedId(feed.id)).join(",");
    if (this.latest?.key === key && this.latest.until > Date.now()) return this.latest.value;
    const query = new URLSearchParams({ parsed: "true", encoding: "hex" });
    for (const feed of selected) query.append("ids[]", feed.id);
    const response = await this.fetcher(`${this.baseUrl}/v2/updates/price/latest?${query}`, {
      headers: { accept: "application/json", authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Pyth Core prices returned ${response.status}`);
    const payload: unknown = await response.json();
    const references = selected.flatMap((feed) => {
      try {
        return [parsePythReference(payload, feed.symbol, feed.id)];
      } catch {
        return [];
      }
    });
    this.latest = { key, until: Date.now() + 5_000, value: references };
    return references;
  }
}
