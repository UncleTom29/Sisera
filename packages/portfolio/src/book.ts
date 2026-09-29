import Decimal from "decimal.js";

/**
 * A book of positions derived from an immutable fill history. Positions use average cost and
 * support shorts; realized P&L is booked whenever a position is reduced, closed or flipped.
 */

export type AssetClassKey =
  | "public_equity"
  | "pre_ipo"
  | "agent_token"
  | "crypto_spot"
  | "perpetual"
  | "prediction"
  | "cash";

export type Fill = {
  id: string;
  mode: "paper" | "live";
  book: string;
  venue: string;
  assetClass: AssetClassKey;
  instrumentKey: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  priceUsd: string;
  feeUsd: string;
  occurredAt: string;
};

export type Position = {
  key: string;
  mode: "paper" | "live";
  book: string;
  venue: string;
  assetClass: AssetClassKey;
  instrumentKey: string;
  symbol: string;
  quantity: string;
  averageCostUsd: string;
  costBasisUsd: string;
  realizedPnlUsd: string;
  feesUsd: string;
  openedAt: string | null;
  lastFillAt: string;
  fills: number;
};

export function positionKey(fill: Pick<Fill, "mode" | "book" | "instrumentKey">): string {
  return `${fill.mode}|${fill.book}|${fill.instrumentKey}`;
}

export function buildPositions(fills: readonly Fill[]): Position[] {
  const positions = new Map<
    string,
    {
      template: Fill;
      quantity: Decimal;
      average: Decimal;
      realized: Decimal;
      fees: Decimal;
      openedAt: string | null;
      lastFillAt: string;
      fills: number;
    }
  >();
  const ordered = [...fills].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
  for (const fill of ordered) {
    const key = positionKey(fill);
    const state = positions.get(key) ?? {
      template: fill,
      quantity: new Decimal(0),
      average: new Decimal(0),
      realized: new Decimal(0),
      fees: new Decimal(0),
      openedAt: null,
      lastFillAt: fill.occurredAt,
      fills: 0,
    };
    const signed = new Decimal(fill.quantity).mul(fill.side === "buy" ? 1 : -1);
    const price = new Decimal(fill.priceUsd);
    const fee = new Decimal(fill.feeUsd || "0");
    state.fees = state.fees.add(fee);
    state.realized = state.realized.sub(fee);
    const sameDirection =
      state.quantity.isZero() || state.quantity.isNegative() === signed.isNegative();
    if (sameDirection) {
      const next = state.quantity.add(signed);
      state.average = next.isZero()
        ? new Decimal(0)
        : state.average.mul(state.quantity.abs()).add(price.mul(signed.abs())).div(next.abs());
      if (state.quantity.isZero()) state.openedAt = fill.occurredAt;
      state.quantity = next;
    } else {
      const closing = Decimal.min(state.quantity.abs(), signed.abs());
      const direction = state.quantity.isNegative() ? -1 : 1;
      state.realized = state.realized.add(price.sub(state.average).mul(closing).mul(direction));
      const remaining = signed.abs().sub(closing);
      state.quantity = state.quantity.add(signed);
      if (state.quantity.isZero()) {
        state.average = new Decimal(0);
        state.openedAt = null;
      } else if (remaining.gt(0)) {
        // The fill flipped the position: the remainder opens a new position at the fill price.
        state.average = price;
        state.openedAt = fill.occurredAt;
      }
    }
    state.lastFillAt = fill.occurredAt;
    state.fills++;
    positions.set(key, state);
  }
  return [...positions.entries()].map(([key, state]) => ({
    key,
    mode: state.template.mode,
    book: state.template.book,
    venue: state.template.venue,
    assetClass: state.template.assetClass,
    instrumentKey: state.template.instrumentKey,
    symbol: state.template.symbol,
    quantity: state.quantity.toFixed(),
    averageCostUsd: state.average.toFixed(),
    costBasisUsd: state.average.mul(state.quantity).toFixed(),
    realizedPnlUsd: state.realized.toFixed(),
    feesUsd: state.fees.toFixed(),
    openedAt: state.openedAt,
    lastFillAt: state.lastFillAt,
    fills: state.fills,
  }));
}

export type Mark = {
  priceUsd: string | null;
  source: string;
  observedAt: string | null;
  /** Liquidity available to exit, used to measure liquidity risk. */
  liquidityUsd?: number | null;
  /** Economic exposure identifier, e.g. the underlying ticker behind a tokenized stock. */
  underlying?: string | null;
  sector?: string | null;
};

export type ValuedPosition = Position & {
  markPriceUsd: string | null;
  marketValueUsd: string | null;
  unrealizedPnlUsd: string | null;
  markSource: string;
  markObservedAt: string | null;
  markStatus: "priced" | "unpriced";
  liquidityUsd: number | null;
  exitLiquidityPct: number | null;
  underlying: string;
  sector: string;
  weightPct: number | null;
};

export type Exposure = { key: string; valueUsd: number; weightPct: number };

export type PortfolioSummary = {
  navUsd: number;
  cashUsd: number;
  investedUsd: number;
  grossExposureUsd: number;
  netExposureUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  feesUsd: number;
  pricedPositions: number;
  unpricedPositions: number;
  byAssetClass: Exposure[];
  bySector: Exposure[];
  byUnderlying: Exposure[];
  byBook: Exposure[];
  byVenue: Exposure[];
  concentration: {
    largestWeightPct: number;
    largestSymbol: string | null;
    top3WeightPct: number;
    herfindahl: number;
    effectivePositions: number;
  };
  duplicateExposures: Array<{ underlying: string; symbols: string[]; combinedWeightPct: number }>;
  liquidityRisk: Array<{
    symbol: string;
    valueUsd: number;
    liquidityUsd: number;
    exitLiquidityPct: number;
  }>;
};

function groupExposure(
  positions: readonly ValuedPosition[],
  keyOf: (p: ValuedPosition) => string,
  nav: number,
) {
  const totals = new Map<string, number>();
  for (const position of positions) {
    const value = Number(position.marketValueUsd ?? 0);
    totals.set(keyOf(position), (totals.get(keyOf(position)) ?? 0) + Math.abs(value));
  }
  return [...totals.entries()]
    .map(([key, valueUsd]) => ({ key, valueUsd, weightPct: nav > 0 ? (valueUsd / nav) * 100 : 0 }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
}

export function valuePositions(
  positions: readonly Position[],
  marks: ReadonlyMap<string, Mark>,
  cashUsd: number,
): { positions: ValuedPosition[]; summary: PortfolioSummary } {
  const open = positions.filter((position) => !new Decimal(position.quantity).isZero());
  const valued: ValuedPosition[] = open.map((position) => {
    const mark = marks.get(position.instrumentKey);
    const price =
      mark?.priceUsd != null && Number.isFinite(Number(mark.priceUsd))
        ? new Decimal(mark.priceUsd)
        : null;
    const quantity = new Decimal(position.quantity);
    const value = price ? price.mul(quantity) : null;
    const liquidity = mark?.liquidityUsd ?? null;
    return {
      ...position,
      markPriceUsd: price?.toFixed() ?? null,
      marketValueUsd: value?.toFixed() ?? null,
      unrealizedPnlUsd: price ? price.sub(position.averageCostUsd).mul(quantity).toFixed() : null,
      markSource: mark?.source ?? "unavailable",
      markObservedAt: mark?.observedAt ?? null,
      markStatus: price ? "priced" : "unpriced",
      liquidityUsd: liquidity,
      exitLiquidityPct:
        value && liquidity && liquidity > 0 ? (value.abs().toNumber() / liquidity) * 100 : null,
      underlying: mark?.underlying ?? position.symbol,
      sector: mark?.sector ?? "Unclassified",
      weightPct: null,
    };
  });
  // Perpetual and prediction positions contribute their P&L to NAV, not their notional.
  const navContribution = (position: ValuedPosition) =>
    position.assetClass === "perpetual"
      ? Number(position.unrealizedPnlUsd ?? 0)
      : Number(position.marketValueUsd ?? 0);
  const invested = valued.reduce((sum, position) => sum + navContribution(position), 0);
  const nav = cashUsd + invested;
  for (const position of valued)
    position.weightPct =
      position.marketValueUsd != null && nav > 0
        ? (Math.abs(Number(position.marketValueUsd)) / nav) * 100
        : null;
  const gross = valued.reduce(
    (sum, position) => sum + Math.abs(Number(position.marketValueUsd ?? 0)),
    0,
  );
  const net = valued.reduce((sum, position) => sum + Number(position.marketValueUsd ?? 0), 0);
  const weights = valued
    .filter((position) => position.weightPct != null)
    .map((position) => ({ symbol: position.symbol, weight: position.weightPct ?? 0 }))
    .sort((a, b) => b.weight - a.weight);
  const herfindahl = weights.reduce((sum, item) => sum + (item.weight / 100) ** 2, 0);
  const byUnderlying = groupExposure(valued, (position) => position.underlying, nav);
  const duplicateExposures = byUnderlying
    .map((exposure) => ({
      underlying: exposure.key,
      symbols: [
        ...new Set(
          valued
            .filter((position) => position.underlying === exposure.key)
            .map((position) => position.symbol),
        ),
      ],
      combinedWeightPct: exposure.weightPct,
    }))
    .filter((exposure) => exposure.symbols.length > 1);
  const allPositions = positions;
  return {
    positions: valued,
    summary: {
      navUsd: nav,
      cashUsd,
      investedUsd: invested,
      grossExposureUsd: gross,
      netExposureUsd: net,
      realizedPnlUsd: allPositions.reduce(
        (sum, position) => sum + Number(position.realizedPnlUsd),
        0,
      ),
      unrealizedPnlUsd: valued.reduce(
        (sum, position) => sum + Number(position.unrealizedPnlUsd ?? 0),
        0,
      ),
      feesUsd: allPositions.reduce((sum, position) => sum + Number(position.feesUsd), 0),
      pricedPositions: valued.filter((position) => position.markStatus === "priced").length,
      unpricedPositions: valued.filter((position) => position.markStatus === "unpriced").length,
      byAssetClass: groupExposure(valued, (position) => position.assetClass, nav),
      bySector: groupExposure(valued, (position) => position.sector, nav),
      byUnderlying,
      byBook: groupExposure(valued, (position) => position.book, nav),
      byVenue: groupExposure(valued, (position) => position.venue, nav),
      concentration: {
        largestWeightPct: weights[0]?.weight ?? 0,
        largestSymbol: weights[0]?.symbol ?? null,
        top3WeightPct: weights.slice(0, 3).reduce((sum, item) => sum + item.weight, 0),
        herfindahl,
        effectivePositions: herfindahl > 0 ? 1 / herfindahl : 0,
      },
      duplicateExposures,
      liquidityRisk: valued
        .filter((position) => position.exitLiquidityPct != null && position.liquidityUsd != null)
        .map((position) => ({
          symbol: position.symbol,
          valueUsd: Math.abs(Number(position.marketValueUsd ?? 0)),
          liquidityUsd: position.liquidityUsd ?? 0,
          exitLiquidityPct: position.exitLiquidityPct ?? 0,
        }))
        .sort((a, b) => b.exitLiquidityPct - a.exitLiquidityPct),
    },
  };
}

export type ProposedTrade = {
  instrumentKey: string;
  symbol: string;
  assetClass: AssetClassKey;
  side: "buy" | "sell";
  notionalUsd: number;
  underlying?: string | null;
  sector?: string | null;
  liquidityUsd?: number | null;
};

export type TradeImpact = {
  before: {
    navUsd: number;
    weightPct: number;
    underlyingWeightPct: number;
    largestWeightPct: number;
    herfindahl: number;
    cashUsd: number;
  };
  after: {
    navUsd: number;
    weightPct: number;
    underlyingWeightPct: number;
    largestWeightPct: number;
    herfindahl: number;
    cashUsd: number;
  };
  liquidityUsagePct: number | null;
  duplicateOf: string[];
  warnings: string[];
  blocked: boolean;
};

export type ImpactLimits = {
  maxPositionWeightPct: number;
  maxUnderlyingWeightPct: number;
  maxLiquidityUsagePct: number;
  minCashUsd: number;
};

export const DEFAULT_IMPACT_LIMITS: ImpactLimits = {
  maxPositionWeightPct: 25,
  maxUnderlyingWeightPct: 35,
  maxLiquidityUsagePct: 2,
  minCashUsd: 0,
};

/** Projects a cash-funded trade onto the current book and reports concentration and liquidity effects. */
export function simulateTrade(
  valued: readonly ValuedPosition[],
  summary: PortfolioSummary,
  trade: ProposedTrade,
  limits: ImpactLimits = DEFAULT_IMPACT_LIMITS,
): TradeImpact {
  const signed = trade.side === "buy" ? trade.notionalUsd : -trade.notionalUsd;
  const current = valued
    .filter((position) => position.instrumentKey === trade.instrumentKey)
    .reduce((sum, position) => sum + Number(position.marketValueUsd ?? 0), 0);
  const underlying = trade.underlying ?? trade.symbol;
  const underlyingValue = valued
    .filter((position) => position.underlying === underlying)
    .reduce((sum, position) => sum + Math.abs(Number(position.marketValueUsd ?? 0)), 0);
  // A cash-funded trade leaves NAV unchanged; only its composition moves.
  const nav = summary.navUsd;
  const weights = new Map<string, number>();
  for (const position of valued)
    weights.set(
      position.instrumentKey,
      (weights.get(position.instrumentKey) ?? 0) + Math.abs(Number(position.marketValueUsd ?? 0)),
    );
  const hhi = (map: Map<string, number>) =>
    nav > 0 ? [...map.values()].reduce((sum, value) => sum + (value / nav) ** 2, 0) : 0;
  const largest = (map: Map<string, number>) =>
    nav > 0 ? (Math.max(0, ...map.values()) / nav) * 100 : 0;
  const beforeHhi = hhi(weights);
  const beforeLargest = largest(weights);
  const afterPosition = current + signed;
  const afterWeights = new Map(weights);
  afterWeights.set(trade.instrumentKey, Math.abs(afterPosition));
  const pct = (value: number) => (nav > 0 ? (value / nav) * 100 : 100);
  const afterUnderlying = Math.max(0, underlyingValue + signed);
  const duplicateOf = [
    ...new Set(
      valued
        .filter(
          (position) =>
            position.underlying === underlying && position.instrumentKey !== trade.instrumentKey,
        )
        .map((position) => position.symbol),
    ),
  ];
  const liquidityUsagePct =
    trade.liquidityUsd && trade.liquidityUsd > 0
      ? (trade.notionalUsd / trade.liquidityUsd) * 100
      : null;
  const cashAfter = summary.cashUsd - signed;
  const warnings: string[] = [];
  let blocked = false;
  if (trade.side === "buy" && cashAfter < limits.minCashUsd) {
    warnings.push(
      `Insufficient cash: the trade needs $${trade.notionalUsd.toFixed(2)} and $${summary.cashUsd.toFixed(2)} is available.`,
    );
    blocked = true;
  }
  if (pct(Math.abs(afterPosition)) > limits.maxPositionWeightPct) {
    warnings.push(
      `Position weight would reach ${pct(Math.abs(afterPosition)).toFixed(1)}%, above the ${limits.maxPositionWeightPct}% limit.`,
    );
    blocked = true;
  }
  if (duplicateOf.length && pct(afterUnderlying) > limits.maxUnderlyingWeightPct) {
    warnings.push(
      `Combined ${underlying} exposure across ${[trade.symbol, ...duplicateOf].join(", ")} would reach ${pct(afterUnderlying).toFixed(1)}%.`,
    );
    blocked = true;
  } else if (duplicateOf.length)
    warnings.push(
      `This duplicates existing ${underlying} exposure held through ${duplicateOf.join(", ")}.`,
    );
  if (liquidityUsagePct != null && liquidityUsagePct > limits.maxLiquidityUsagePct) {
    warnings.push(
      `The order is ${liquidityUsagePct.toFixed(2)}% of available liquidity, above ${limits.maxLiquidityUsagePct}%; expect meaningful price impact.`,
    );
    blocked = true;
  }
  if (liquidityUsagePct == null)
    warnings.push("Liquidity for this market is unknown, so price impact cannot be estimated.");
  if (trade.side === "sell" && current + signed < -0.000001 && trade.assetClass !== "perpetual") {
    warnings.push("The sale exceeds the current holding.");
    blocked = true;
  }
  return {
    before: {
      navUsd: nav,
      weightPct: pct(Math.abs(current)),
      underlyingWeightPct: pct(underlyingValue),
      largestWeightPct: beforeLargest,
      herfindahl: beforeHhi,
      cashUsd: summary.cashUsd,
    },
    after: {
      navUsd: nav,
      weightPct: pct(Math.abs(afterPosition)),
      underlyingWeightPct: pct(afterUnderlying),
      largestWeightPct: largest(afterWeights),
      herfindahl: hhi(afterWeights),
      cashUsd: cashAfter,
    },
    liquidityUsagePct,
    duplicateOf,
    warnings,
    blocked,
  };
}

export type Scenario = {
  id: string;
  name: string;
  description: string;
  shocksByAssetClass: Partial<Record<AssetClassKey, number>>;
  /** Extra haircut applied to positions whose exit exceeds this share of liquidity. */
  illiquidHaircut?: { exitLiquidityPct: number; extraShockPct: number };
};

export const STANDARD_SCENARIOS: readonly Scenario[] = [
  {
    id: "equity_selloff",
    name: "Equity sell-off",
    description: "Public equities −10%, pre-IPO marks −20%, agent tokens −35%, crypto −15%.",
    shocksByAssetClass: {
      public_equity: -10,
      pre_ipo: -20,
      agent_token: -35,
      crypto_spot: -15,
      perpetual: -15,
    },
  },
  {
    id: "private_mark_reset",
    name: "Private mark reset",
    description: "Pre-IPO tokens reprice 30% lower as issuer marks are cut.",
    shocksByAssetClass: { pre_ipo: -30 },
  },
  {
    id: "crypto_crash",
    name: "Crypto flash crash",
    description: "Crypto −30% and agent tokens −60% in a liquidity cascade.",
    shocksByAssetClass: { crypto_spot: -30, perpetual: -30, agent_token: -60, public_equity: -3 },
  },
  {
    id: "liquidity_freeze",
    name: "Liquidity freeze",
    description: "Positions above 5% of pool liquidity take an extra 25% exit haircut.",
    shocksByAssetClass: { agent_token: -10, pre_ipo: -5, public_equity: -2 },
    illiquidHaircut: { exitLiquidityPct: 5, extraShockPct: -25 },
  },
  {
    id: "weekend_gap",
    name: "Weekend gap",
    description: "Tokenized equities gap 7% lower against the Monday open while venues are closed.",
    shocksByAssetClass: { public_equity: -7 },
  },
];

export function runScenario(
  valued: readonly ValuedPosition[],
  summary: PortfolioSummary,
  scenario: Scenario,
) {
  let pnl = 0;
  const byPosition: Array<{ symbol: string; pnlUsd: number }> = [];
  for (const position of valued) {
    const value = Number(position.marketValueUsd ?? 0);
    let shock = scenario.shocksByAssetClass[position.assetClass] ?? 0;
    if (
      scenario.illiquidHaircut &&
      position.exitLiquidityPct != null &&
      position.exitLiquidityPct > scenario.illiquidHaircut.exitLiquidityPct
    )
      shock += scenario.illiquidHaircut.extraShockPct;
    const positionPnl = (value * shock) / 100;
    pnl += positionPnl;
    if (positionPnl !== 0) byPosition.push({ symbol: position.symbol, pnlUsd: positionPnl });
  }
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    pnlUsd: pnl,
    pnlPct: summary.navUsd > 0 ? (pnl / summary.navUsd) * 100 : 0,
    navAfterUsd: summary.navUsd + pnl,
    byPosition: byPosition.sort((a, b) => a.pnlUsd - b.pnlUsd).slice(0, 10),
    unpricedExcluded: summary.unpricedPositions,
  };
}
