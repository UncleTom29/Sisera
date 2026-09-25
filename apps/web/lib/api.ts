import type {
  Candle,
  Instrument,
  MarketSnapshot,
  OrderBook,
  PredictionMarket,
} from "@sisera/domain";

export type MarketRow = { instrument: Instrument; snapshot: MarketSnapshot };
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

async function getJson<T>(path: string, identity: ApiIdentity): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { accept: "application/json", ...identityHeaders(identity) },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Sisera API returned ${response.status}`);
  return response.json() as Promise<T>;
}

export function getMarket(symbol: string, identity: ApiIdentity) {
  return getJson<{ instrument: Instrument; snapshot: MarketSnapshot }>(
    `/v1/markets/${encodeURIComponent(symbol)}`,
    identity,
  );
}

export async function getMarkets(symbols: readonly string[], identity: ApiIdentity) {
  return getJson<{ data: MarketRow[]; unavailable: Array<{ symbol: string; reason: string }> }>(
    `/v1/markets?symbols=${encodeURIComponent(symbols.join(","))}`,
    identity,
  );
}

export async function getCandles(symbol: string, interval: string, identity: ApiIdentity) {
  const payload = await getJson<{ data: Candle[]; interval: string }>(
    `/v1/markets/${encodeURIComponent(symbol)}/candles?interval=${encodeURIComponent(interval)}&limit=240`,
    identity,
  );
  return payload.data;
}

export async function getOrderBook(symbol: string, identity: ApiIdentity) {
  const payload = await getJson<{ data: OrderBook }>(
    `/v1/markets/${encodeURIComponent(symbol)}/depth?limit=20`,
    identity,
  );
  return payload.data;
}

export async function getMarketIntelligence(symbol: string, identity: ApiIdentity) {
  const payload = await getJson<{ data: MarketIntelligence }>(
    `/v1/markets/${encodeURIComponent(symbol)}/intelligence`,
    identity,
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
