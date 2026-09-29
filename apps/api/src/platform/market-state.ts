import type { Candle } from "@sisera/domain";
import { type Condition, type MarketState, TECHNICAL_CONDITIONS } from "@sisera/policy";
import type { CatalogAsset } from "./catalog.js";
import type { HistoryService } from "./history.js";
import type { IntelligenceService } from "./intelligence-service.js";

export type StateSnapshot = {
  asset: { key: string; symbol: string; kind: string; mint: string };
  priceUsd: number | null;
  priceSource: string;
  premiumPct: number | null;
  referencePriceUsd: number | null;
  referenceKind: string | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
  events: number;
  candles: number;
  observedAt: string;
  dataAgeMs: number | null;
};

/**
 * Assembles the deterministic inputs a policy or agent is evaluated against, from the catalog,
 * the event store and (only when a rule needs it) price history.
 */
export class MarketStateBuilder {
  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly history: HistoryService,
  ) {}

  async build(
    asset: CatalogAsset,
    conditions: readonly Condition[],
    options: { timeframe?: string; candles?: readonly Candle[] } = {},
  ): Promise<{ state: MarketState; snapshot: StateSnapshot }> {
    const needsEvents = conditions.some((condition) => condition.type === "no_negative_event");
    const needsCandles = conditions.some(
      (condition) =>
        TECHNICAL_CONDITIONS.has(condition.type) &&
        condition.type !== "price_below" &&
        condition.type !== "price_above",
    );
    const [intelligence, series] = await Promise.all([
      needsEvents ? this.intelligence.forAsset(asset).catch(() => null) : Promise.resolve(null),
      needsCandles && !options.candles
        ? (asset.kind === "public_equity"
            ? this.history.equity(asset.underlying, options.timeframe ?? "1h", 1)
            : this.history.solanaToken(asset.mint, options.timeframe ?? "1h")
          ).catch(() => null)
        : Promise.resolve(null),
    ]);
    const candles = options.candles ?? series?.candles ?? null;
    const state: MarketState = {
      price: asset.priceUsd,
      premiumPct: asset.premiumPct,
      liquidityUsd: asset.liquidityUsd,
      volume24hUsd: asset.volume24hUsd,
      change24hPct: asset.change24hPct,
      referenceFresh: asset.referenceFresh,
      events: intelligence
        ? intelligence.events.map((event) => ({
            severity: event.severity,
            sentiment: event.sentiment,
            certainty: event.certainty,
            lastSeenAt: event.lastSeenAt,
            headline: event.headline,
          }))
        : needsEvents
          ? null
          : [],
      candles,
      observedAt: asset.observedAt,
    };
    const observed = Date.parse(asset.observedAt);
    return {
      state,
      snapshot: {
        asset: { key: asset.key, symbol: asset.symbol, kind: asset.kind, mint: asset.mint },
        priceUsd: asset.priceUsd,
        priceSource: asset.priceSource,
        premiumPct: asset.premiumPct,
        referencePriceUsd: asset.referencePriceUsd,
        referenceKind: asset.referenceKind,
        liquidityUsd: asset.liquidityUsd,
        volume24hUsd: asset.volume24hUsd,
        change24hPct: asset.change24hPct,
        events: intelligence?.events.length ?? 0,
        candles: candles?.length ?? 0,
        observedAt: asset.observedAt,
        dataAgeMs: Number.isFinite(observed) ? Math.max(0, Date.now() - observed) : null,
      },
    };
  }
}
