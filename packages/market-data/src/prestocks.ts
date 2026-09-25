import { type Instrument, Instrument as InstrumentSchema } from "@sisera/domain";
import { z } from "zod";

const Mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const PreStockPayload = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  description: z.string().nullable().optional(),
  image: z.string().url().nullable().optional(),
  external_url: z.string().url().nullable().optional(),
  contract_address: Mint,
  tokenPrice: z.number().positive(),
  markPrice: z.number().positive(),
  impliedValuation: z.number().nonnegative(),
  markValuation: z.number().nonnegative(),
  supply: z.number().nonnegative(),
});

export type PreStock = {
  instrument: Instrument;
  company: string;
  description: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  tokenPrice: string;
  markPrice: string;
  impliedValuation: string;
  markValuation: string;
  premiumDiscountPct: string;
  marketCap: string;
  supply: string;
  liquidityUsd: null;
  holders: null;
  updatedAt: null;
  fetchedAt: string;
  source: "prestocks";
};

export class PreStocksProvider {
  private cache: { until: number; value: PreStock[] } | null = null;

  constructor(
    private readonly baseUrl = "https://prestocks.com",
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async list(): Promise<PreStock[]> {
    if (this.cache && this.cache.until > Date.now()) return this.cache.value;
    const response = await this.fetcher(`${this.baseUrl}/api/prestocks`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`PreStocks returned ${response.status}`);
    const payload = z.array(PreStockPayload).parse(await response.json());
    const fetchedAt = new Date().toISOString();
    const value = payload.map((asset): PreStock => {
      const instrument = InstrumentSchema.parse({
        id: `prestocks-solana:${asset.contract_address}:pre_ipo_equity`,
        venue: "prestocks-solana",
        venueSymbol: asset.contract_address,
        displaySymbol: `${asset.symbol} / USD`,
        assetClass: "equity",
        type: "pre_ipo_equity",
        baseAsset: asset.symbol,
        quoteAsset: "USD",
        priceIncrement: "0.00000001",
        quantityIncrement: "0.000000001",
        status: "active",
        chain: "solana",
        mint: asset.contract_address,
        issuer: "PreStocks",
        provider: "prestocks",
        markPrice: String(asset.markPrice),
        impliedValuation: String(asset.impliedValuation),
        referenceValuation: String(asset.markValuation),
      });
      return {
        instrument,
        company: asset.name,
        description: asset.description ?? null,
        imageUrl: asset.image ?? null,
        productUrl: asset.external_url ?? null,
        tokenPrice: String(asset.tokenPrice),
        markPrice: String(asset.markPrice),
        impliedValuation: String(asset.impliedValuation),
        markValuation: String(asset.markValuation),
        premiumDiscountPct: String((asset.tokenPrice / asset.markPrice - 1) * 100),
        marketCap: String(asset.tokenPrice * asset.supply),
        supply: String(asset.supply),
        liquidityUsd: null,
        holders: null,
        updatedAt: null,
        fetchedAt,
        source: "prestocks",
      };
    });
    this.cache = { until: Date.now() + 30_000, value };
    return value;
  }
}
