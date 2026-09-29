import { type NextRequest, NextResponse } from "next/server";
import { serverApiUrl } from "../../../lib/server-api-url";

export type ChartBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const intervals = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

/** Candles for the trading chart, normalized across Solana tokens, Binance, and Hyperliquid. */
export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source");
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const interval = request.nextUrl.searchParams.get("interval") ?? "1h";
  if (!intervals.has(interval))
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });

  let url: string;
  if (source === "solana" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id))
    url = `/v1/solana/tokens/${id}/history?interval=${interval}`;
  else if ((source === "binance" || source === "hyperliquid") && /^[A-Za-z0-9]{2,20}$/.test(id))
    url = `/v1/markets/${encodeURIComponent(id)}/candles?venue=${source}&interval=${interval}&limit=500`;
  else return NextResponse.json({ error: "invalid_source" }, { status: 400 });

  const response = await fetch(`${serverApiUrl()}${url}`, {
    next: { revalidate: interval === "1m" ? 5 : 15 },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ data: [] }, { status: 503 });
  const payload = (await response.json()) as {
    data: Array<Record<string, string | number | null>>;
  };
  const data: ChartBar[] = payload.data
    .map((row) => ({
      time:
        typeof row.time === "string" ? Math.floor(Date.parse(row.time) / 1000) : Number(row.time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume ?? row.volumeUsd ?? 0),
    }))
    .filter((bar) => Number.isFinite(bar.time) && Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.time - b.time)
    .filter((bar, index, bars) => index === 0 || bar.time !== bars[index - 1]?.time);
  return NextResponse.json({ data });
}
