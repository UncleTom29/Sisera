import type { Instrument, MarketSnapshot, PredictionMarket } from "@sisera/domain";

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

export async function getPredictionMarkets(identity: ApiIdentity) {
  const payload = await getJson<{ data: PredictionMarket[] }>(
    "/v1/prediction-markets?limit=24",
    identity,
  );
  return payload.data;
}
