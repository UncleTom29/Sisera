"use client";

import { useLivePrice } from "../lib/live-prices";
import { usePerpMid, useSpotTick } from "../lib/market-streams";
import { formatSignedPct, signTone } from "../lib/sign";
import { LiveNumber } from "./live-number";

const usd = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1000 ? 2 : value >= 1 ? 2 : 6,
  });

/** A Solana token price that updates every second, falling back to the server-rendered value. */
export function LiveTokenPrice({
  mint,
  fallback,
  className = "",
}: {
  mint: string;
  fallback: number | null;
  className?: string;
}) {
  const live = useLivePrice(mint);
  const value = live?.usd ?? fallback;
  return (
    <LiveNumber value={value} display={value == null ? "—" : usd(value)} className={className} />
  );
}

/** The token's 24h change, live when available. */
export function LiveTokenChange({
  mint,
  fallback,
  className = "",
}: {
  mint: string;
  fallback: number | null;
  className?: string;
}) {
  const live = useLivePrice(mint);
  const value = live?.change24hPct ?? fallback;
  return <span className={`num ${signTone(value)} ${className}`}>{formatSignedPct(value)}</span>;
}

/** A Binance spot price pushed over WebSocket every second. */
export function LiveSpotPrice({
  symbol,
  fallback,
  className = "",
}: {
  symbol: string;
  fallback: number | null;
  className?: string;
}) {
  const tick = useSpotTick(symbol);
  const value = tick?.last ?? fallback;
  return (
    <LiveNumber value={value} display={value == null ? "—" : usd(value)} className={className} />
  );
}

export function LiveSpotChange({
  symbol,
  fallback,
  className = "",
}: {
  symbol: string;
  fallback: number | null;
  className?: string;
}) {
  const tick = useSpotTick(symbol);
  const value = tick?.change24hPct ?? fallback;
  return <span className={`num ${signTone(value)} ${className}`}>{formatSignedPct(value)}</span>;
}

/** A Hyperliquid perpetual mid price pushed over WebSocket. */
export function LivePerpPrice({
  coin,
  fallback,
  className = "",
}: {
  coin: string;
  fallback: number | null;
  className?: string;
}) {
  const mid = usePerpMid(coin);
  const value = mid ?? fallback;
  return (
    <LiveNumber value={value} display={value == null ? "—" : usd(value)} className={className} />
  );
}
