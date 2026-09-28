import { StatusBadge } from "@sisera/ui";
import { ListFilter } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { LiveRefresh } from "../../../components/live-refresh";
import { MarketScreener } from "../../../components/market-screener";
import { PageHeader } from "../../../components/page-header";
import { ReferenceScreener } from "../../../components/reference-screener";
import { getMarketOverview, getMarkets, getReferenceMarkets } from "../../../lib/api";

export const dynamic = "force-dynamic";
const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "LTCUSDT",
  "TRXUSDT",
];

export default async function MarketsPage({
  searchParams,
}: { searchParams: Promise<{ venue?: string }> }) {
  if ((await searchParams).venue === "hyperliquid") redirect("/terminal?venue=hyperliquid");
  const venue = "binance" as const;
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const [result, overview] = await Promise.all([
    getMarkets(symbols, identity, venue).catch(() => null),
    getMarketOverview(identity).catch(() => null),
  ]);
  const rows = result?.data ?? [];
  const references = !rows.length
    ? await getReferenceMarkets(symbols, identity).catch(() => [])
    : [];
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Discover / Crypto spot"
        title="Crypto spot markets"
        description="Find the markets moving today, compare activity, and open a detailed trading view."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={rows.length ? "positive" : "negative"}>
              {rows.length
                ? `${rows.length} markets live`
                : references.length
                  ? "Market context available"
                  : "Reconnecting"}
            </StatusBadge>
            <LiveRefresh />
          </div>
        }
      />
      <div className="p-4 md:p-6">
        <div className="mb-4 flex gap-2 text-xs">
          <Link
            href="/terminal?venue=hyperliquid"
            className="rounded border border-line px-3 py-2 text-slate-400"
          >
            Hyperliquid perps
          </Link>
          <Link
            href="/markets?venue=binance"
            className="rounded border border-line bg-cyan-400/10 px-3 py-2 text-cyan-300"
          >
            Binance spot
          </Link>
        </div>
        {rows.length ? (
          <MarketScreener rows={rows} venue={venue} />
        ) : references.length ? (
          <ReferenceScreener rows={references} />
        ) : overview?.crypto.length ? (
          <section className="overflow-hidden rounded-lg border border-line bg-panel">
            <div className="border-b border-line p-5">
              <h2 className="font-semibold text-white">Today’s crypto leaders</h2>
              <p className="mt-1 text-xs text-slate-400">
                Explore the wider market while live spot quotes reconnect.
              </p>
            </div>
            <div className="divide-y divide-line">
              {overview.crypto.slice(0, 15).map((asset) => (
                <Link
                  key={asset.id}
                  href={`/spot/${asset.symbol}USDT`}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-white/[.025]"
                >
                  <span>
                    <span className="font-semibold text-white">{asset.symbol}</span>
                    <span className="ml-3 text-xs text-slate-500">{asset.name}</span>
                  </span>
                  <span className="text-right font-mono text-xs text-white">
                    {asset.priceUsd == null
                      ? "Quote pending"
                      : `$${asset.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 4 })}`}
                    <span
                      className={`ml-4 ${asset.change24hPct == null ? "text-slate-500" : asset.change24hPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {asset.change24hPct == null
                        ? ""
                        : `${asset.change24hPct > 0 ? "+" : ""}${asset.change24hPct.toFixed(2)}%`}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={ListFilter}
            title="Markets are reconnecting"
            copy="Browse stocks or private markets while crypto quotes resume."
          />
        )}
      </div>
    </div>
  );
}
