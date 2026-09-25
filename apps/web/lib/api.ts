import type {
  Candle,
  Instrument,
  MarketSnapshot,
  OrderBook,
  PredictionMarket,
} from "@sisera/domain";

export type MarketRow = { instrument: Instrument; snapshot: MarketSnapshot };
export type Venue = "binance" | "hyperliquid";
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
export type ChainTvl = {
  name: string;
  tvlUsd: number;
  tokenSymbol: string | null;
  chainId: string | null;
  observedAt: string;
  source: "defillama";
};
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
export type ReferenceMarket = {
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number | null;
  volume24hUsd: number | null;
  observedAt: string;
  source: "coingecko";
};
export type MarketIntelligence = {
  score: number;
  regime: "risk_on" | "risk_off" | "transition";
  direction: "long" | "short" | "neutral";
  confidence: number;
  signals: Array<{
    id: string;
    label: string;
    value: number;
    score: number;
    direction: "bullish" | "bearish" | "neutral";
    confidence: number;
  }>;
  observedAt: string;
  sampleSize: number;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ApiIdentity = { accessToken?: string | undefined; localOperator?: boolean | undefined };

function identityHeaders(identity: ApiIdentity): HeadersInit {
  if (identity.accessToken) return { authorization: `Bearer ${identity.accessToken}` };
  if (identity.localOperator)
    return { "x-sisera-dev-role": "admin", "x-sisera-dev-subject": "web-local" };
  return {};
}

async function getJson<T>(path: string, identity: ApiIdentity, timeoutMs = 5000): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { accept: "application/json", ...identityHeaders(identity) },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Sisera API returned ${response.status}`);
  return response.json() as Promise<T>;
}

export function getMarket(symbol: string, identity: ApiIdentity, venue: Venue = "binance") {
  return getJson<{ instrument: Instrument; snapshot: MarketSnapshot }>(
    `/v1/markets/${encodeURIComponent(symbol)}?venue=${venue}`,
    identity,
  );
}

export async function getMarkets(
  symbols: readonly string[],
  identity: ApiIdentity,
  venue: Venue = "binance",
) {
  return getJson<{ data: MarketRow[]; unavailable: Array<{ symbol: string; reason: string }> }>(
    `/v1/markets?symbols=${encodeURIComponent(symbols.join(","))}&venue=${venue}`,
    identity,
  );
}

export async function getReferenceMarkets(symbols: readonly string[], identity: ApiIdentity) {
  const payload = await getJson<{ data: ReferenceMarket[] }>(
    `/v1/reference-markets?symbols=${encodeURIComponent(symbols.join(","))}`,
    identity,
    8000,
  );
  return payload.data;
}

export async function getCandles(
  symbol: string,
  interval: string,
  identity: ApiIdentity,
  venue: Venue = "binance",
) {
  const payload = await getJson<{ data: Candle[]; interval: string }>(
    `/v1/markets/${encodeURIComponent(symbol)}/candles?interval=${encodeURIComponent(interval)}&limit=240&venue=${venue}`,
    identity,
  );
  return payload.data;
}

export async function getOrderBook(
  symbol: string,
  identity: ApiIdentity,
  venue: Venue = "binance",
) {
  const payload = await getJson<{ data: OrderBook }>(
    `/v1/markets/${encodeURIComponent(symbol)}/depth?limit=20&venue=${venue}`,
    identity,
  );
  return payload.data;
}

export async function getMarketIntelligence(
  symbol: string,
  identity: ApiIdentity,
  venue: Venue = "binance",
) {
  const payload = await getJson<{ data: MarketIntelligence }>(
    `/v1/markets/${encodeURIComponent(symbol)}/intelligence?venue=${venue}`,
    identity,
  );
  return payload.data;
}

export async function getPerpetualMetrics(identity: ApiIdentity) {
  const payload = await getJson<{ data: PerpetualMetric[] }>("/v1/perpetual-metrics", identity);
  return payload.data;
}

export async function getChains(identity: ApiIdentity) {
  const payload = await getJson<{ data: ChainTvl[] }>("/v1/chains?limit=20", identity, 8000);
  return payload.data;
}

export async function getPublicPerpAccount(address: string, identity: ApiIdentity) {
  const payload = await getJson<{ data: PublicPerpAccount }>(
    `/v1/public-wallet/${encodeURIComponent(address)}`,
    identity,
    8000,
  );
  return payload.data;
}

export async function getPredictionMarkets(identity: ApiIdentity) {
  const payload = await getJson<{ data: PredictionMarket[] }>(
    "/v1/prediction-markets?limit=24",
    identity,
  );
  return payload.data;
}
