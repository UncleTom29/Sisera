import type { AssetCatalog, CatalogAsset } from "./catalog.js";
import type { IntelligenceService } from "./intelligence-service.js";
import type { PortfolioService } from "./portfolio-service.js";

export type PrivateRankBy =
  | "divergence"
  | "discount"
  | "premium"
  | "liquidity"
  | "momentum"
  | "risk"
  | "news"
  | "portfolio_fit";

/** Screens across the catalog. Rankings only use observed values; missing inputs sort last. */
export class RankingService {
  constructor(
    private readonly catalog: AssetCatalog,
    private readonly intelligence: IntelligenceService,
    private readonly portfolio: PortfolioService | null,
  ) {}

  /** Tokenized public equities ordered by absolute premium or discount to the underlying share. */
  async fairValueGaps(
    options: { minLiquidityUsd?: number; limit?: number; freshOnly?: boolean } = {},
  ) {
    const assets = await this.catalog.list({ withReferences: true });
    return assets
      .filter((asset) => asset.kind === "public_equity" && asset.premiumPct != null)
      .filter((asset) => (asset.liquidityUsd ?? 0) >= (options.minLiquidityUsd ?? 10_000))
      .filter((asset) => !options.freshOnly || asset.referenceFresh === true)
      .sort((a, b) => Math.abs(b.premiumPct ?? 0) - Math.abs(a.premiumPct ?? 0))
      .slice(0, options.limit ?? 20)
      .map((asset) => ({
        symbol: asset.symbol,
        name: asset.name,
        mint: asset.mint,
        priceUsd: asset.priceUsd,
        referencePriceUsd: asset.referencePriceUsd,
        premiumPct: asset.premiumPct,
        referenceFresh: asset.referenceFresh,
        liquidityUsd: asset.liquidityUsd,
        volume24hUsd: asset.volume24hUsd,
        note:
          asset.referenceFresh === false
            ? "Reference is from the last session; the gap may reflect market hours."
            : (asset.liquidityUsd ?? 0) < 50_000
              ? "Thin liquidity; the displayed gap may not be executable."
              : null,
      }));
  }

  private riskOf(asset: CatalogAsset): number {
    const liquidity = asset.liquidityUsd ?? 0;
    const liquidityRisk =
      liquidity < 25_000 ? 40 : liquidity < 100_000 ? 25 : liquidity < 500_000 ? 12 : 5;
    const premiumRisk = Math.min(30, Math.abs(asset.premiumPct ?? 0) * 1.5);
    const volatilityRisk = Math.min(30, Math.abs(asset.change24hPct ?? 0) * 2);
    return Math.round(liquidityRisk + premiumRisk + volatilityRisk);
  }

  async privateMarkets(by: PrivateRankBy, subject?: string) {
    const assets = (await this.catalog.list()).filter((asset) => asset.kind === "pre_ipo");
    const since = new Date(Date.now() - 72 * 3_600_000).toISOString();
    const newsCounts = new Map<string, number>();
    await Promise.all(
      assets.map(async (asset) => {
        const events = await this.intelligence
          .stored({ assetKey: asset.key, since, limit: 100 })
          .catch(() => []);
        newsCounts.set(asset.key, events.length);
      }),
    );
    let portfolio: Awaited<ReturnType<PortfolioService["view"]>> | null = null;
    if (by === "portfolio_fit" && subject && this.portfolio)
      portfolio = await this.portfolio.view(subject, "paper").catch(() => null);
    const rows = assets.map((asset) => {
      const sectorWeight =
        portfolio?.summary.bySector.find((row) => row.key === asset.sector)?.weightPct ?? 0;
      const held =
        portfolio?.positions.some((position) => position.instrumentKey === asset.mint) ?? false;
      return {
        symbol: asset.symbol,
        name: asset.name,
        mint: asset.mint,
        imageUrl: asset.imageUrl,
        sector: asset.sector,
        priceUsd: asset.priceUsd,
        markPriceUsd: asset.referencePriceUsd,
        premiumPct: asset.premiumPct,
        impliedValuationUsd: asset.impliedValuationUsd,
        markValuationUsd: asset.referenceValuationUsd,
        liquidityUsd: asset.liquidityUsd,
        volume24hUsd: asset.volume24hUsd,
        change24hPct: asset.change24hPct,
        riskScore: this.riskOf(asset),
        newsEvents72h: newsCounts.get(asset.key) ?? 0,
        portfolioFit: portfolio ? Math.max(0, 100 - sectorWeight * 2 - (held ? 30 : 0)) : null,
        priceSource: asset.priceSource,
      };
    });
    const key: Record<PrivateRankBy, (row: (typeof rows)[number]) => number> = {
      divergence: (row) => Math.abs(row.premiumPct ?? Number.NEGATIVE_INFINITY),
      discount: (row) => -(row.premiumPct ?? Number.POSITIVE_INFINITY),
      premium: (row) => row.premiumPct ?? Number.NEGATIVE_INFINITY,
      liquidity: (row) => row.liquidityUsd ?? Number.NEGATIVE_INFINITY,
      momentum: (row) => row.change24hPct ?? Number.NEGATIVE_INFINITY,
      risk: (row) => -row.riskScore,
      news: (row) => row.newsEvents72h,
      portfolio_fit: (row) => row.portfolioFit ?? Number.NEGATIVE_INFINITY,
    };
    return rows.sort((a, b) => key[by](b) - key[by](a));
  }
}
