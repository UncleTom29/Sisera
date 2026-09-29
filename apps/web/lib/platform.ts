/** Browser-side access to the Sisera platform API through the same-origin proxy. */

export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function platform<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api/platform/${path.replace(/^\//, "")}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers:
      init.body === undefined
        ? { accept: "application/json" }
        : { "content-type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    message?: string;
    issues?: Array<{ message: string; path?: unknown[] }>;
  };
  if (!response.ok) {
    const issue = payload.issues?.[0];
    throw new PlatformError(
      payload.message ??
        (issue
          ? `${(issue.path ?? []).join(".")}: ${issue.message}`
          : `Request failed (${response.status}).`),
      response.status,
    );
  }
  return payload.data as T;
}

export type Certainty =
  | "confirmed"
  | "corroborated"
  | "single_source"
  | "rumor"
  | "unverified_social";
export type Severity = "low" | "medium" | "high" | "critical";

export type MarketEvent = {
  id: string;
  headline: string;
  primaryCategory: string;
  categories: string[];
  severity: Severity;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  certainty: Certainty;
  corroboration: number;
  firstSeenAt: string;
  lastSeenAt: string;
  impactScore: number;
  assets: Array<{ key: string; symbol: string; relevance: number }>;
  sources: Array<{
    publisher: string;
    url: string;
    tier: string;
    publishedAt: string;
    title: string;
  }>;
  basis: string[];
};

export type CatalogAsset = {
  key: string;
  kind: "public_equity" | "pre_ipo" | "agent_token";
  symbol: string;
  name: string;
  mint: string;
  underlying: string;
  sector: string;
  priceUsd: number | null;
  priceSource: string;
  change1hPct: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  referencePriceUsd: number | null;
  referenceKind: "prestocks_mark" | "public_equity" | null;
  premiumPct: number | null;
  referenceFresh: boolean | null;
  impliedValuationUsd: number | null;
  referenceValuationUsd: number | null;
  pairedStock: { symbol: string; mint: string } | null;
  imageUrl: string | null;
  observedAt: string;
};

export type ConditionResult = {
  condition: { type: string } & Record<string, unknown>;
  passed: boolean;
  dataAvailable: boolean;
  actual: string | null;
  detail: string;
};

export type TradingPolicy = {
  version: 1;
  name: string;
  instrument: { kind: string; symbol: string; mint?: string; name: string };
  action: { side: "buy" | "sell"; notionalUsd: number; mode: "paper" | "live" };
  triggers: Array<{ type: string } & Record<string, unknown>>;
  invalidation: {
    expiresAt: string;
    conditions: Array<{ type: string } & Record<string, unknown>>;
  };
  execution: { maxSlippageBps: number; requireApproval: boolean };
  limits: { maxPortfolioWeightPct: number; maxLiquidityUsagePct: number };
  sourceText: string;
};

export type PolicyRow = {
  id: string;
  name: string;
  policy: TradingPolicy;
  mode: "paper" | "live";
  status: string;
  lastEvaluation: {
    status?: string;
    reasons?: string[];
    triggers?: ConditionResult[];
    evaluatedAt?: string;
  } | null;
  lastEvaluatedAt: string | null;
  execution: Record<string, unknown> | null;
  createdAt: string;
};

export type TradeImpact = {
  asset: { symbol: string; name: string; sector: string; underlying: string };
  trade: { side: string; notionalUsd: number; mode: string };
  impact: {
    before: {
      weightPct: number;
      underlyingWeightPct: number;
      largestWeightPct: number;
      cashUsd: number;
    };
    after: {
      weightPct: number;
      underlyingWeightPct: number;
      largestWeightPct: number;
      cashUsd: number;
    };
    liquidityUsagePct: number | null;
    duplicateOf: string[];
    warnings: string[];
    blocked: boolean;
  };
  sector: { name: string; beforePct: number; afterPct: number };
  navUsd: number;
};

export const usd = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : Math.abs(value) >= 100_000
      ? `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)}`
      : `$${value.toLocaleString("en-US", { maximumFractionDigits: Math.abs(value) < 1 ? 6 : digits })}`;
export const pct = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
export const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

export function describeCondition(condition: { type: string } & Record<string, unknown>): string {
  const value = (key: string) => condition[key] as number | string | boolean | undefined;
  switch (condition.type) {
    case "premium_below":
      return `premium below ${value("pct")}%`;
    case "premium_above":
      return `premium above ${value("pct")}%`;
    case "price_below":
      return `price below $${value("usd")}`;
    case "price_above":
      return `price above $${value("usd")}`;
    case "liquidity_above":
      return `liquidity above ${usd(Number(value("usd")))}`;
    case "volume_24h_above":
      return `24h volume above ${usd(Number(value("usd")))}`;
    case "change_24h_below":
      return `24h change below ${value("pct")}%`;
    case "change_24h_above":
      return `24h change above ${value("pct")}%`;
    case "no_negative_event":
      return `no ${value("minSeverity")}+ negative event in ${value("lookbackHours")}h`;
    case "reference_fresh":
      return "fresh reference price";
    case "ema_trend":
      return `EMA ${value("fast")}/${value("slow")} ${value("direction")}${value("requireCross") ? " cross" : ""}`;
    case "rsi_below":
      return `RSI(${value("period")}) below ${value("value")}`;
    case "rsi_above":
      return `RSI(${value("period")}) above ${value("value")}`;
    case "breakout_high":
      return `breaks ${value("lookback")}-bar high`;
    case "breakdown_low":
      return `breaks ${value("lookback")}-bar low`;
    case "relative_volume_above":
      return `volume > ${value("ratio")}× ${value("lookback")}-bar avg`;
    case "close_above_sma":
      return `close above SMA(${value("period")})`;
    case "close_below_sma":
      return `close below SMA(${value("period")})`;
    case "return_above":
      return `${value("bars")}-bar return above ${value("pct")}%`;
    case "return_below":
      return `${value("bars")}-bar return below ${value("pct")}%`;
    default:
      return condition.type;
  }
}
