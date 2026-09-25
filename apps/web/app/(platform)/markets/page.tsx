import { StatusBadge } from "@sisera/ui";
import { ListFilter } from "lucide-react";
import Link from "next/link";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { LiveRefresh } from "../../../components/live-refresh";
import { MarketScreener } from "../../../components/market-screener";
import { PageHeader } from "../../../components/page-header";
import { ReferenceScreener } from "../../../components/reference-screener";
import { getMarkets, getReferenceMarkets } from "../../../lib/api";

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
  const venue = (await searchParams).venue === "binance" ? "binance" : "hyperliquid";
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const result = await getMarkets(symbols, identity, venue).catch(() => null);
  const rows = result?.data ?? [];
  const references =
    venue === "binance" && !rows.length
      ? await getReferenceMarkets(symbols, identity).catch(() => [])
      : [];
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow={`Discover / Crypto ${venue === "hyperliquid" ? "perpetuals" : "spot"}`}
        title="Markets"
        description="Venue-specific bid, ask, 24h activity, source, and update times. Spot and perpetual markets are never conflated."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={rows.length ? "positive" : "negative"}>
              {rows.length
                ? `${rows.length} markets live`
                : references.length
                  ? "Reference data only"
                  : "Providers unavailable"}
            </StatusBadge>
            <LiveRefresh />
          </div>
        }
      />
      <div className="p-4 md:p-6">
        <div className="mb-4 flex gap-2 text-xs">
          <Link
            href="/markets?venue=hyperliquid"
            className={`rounded border border-line px-3 py-2 ${venue === "hyperliquid" ? "bg-cyan-400/10 text-cyan-300" : "text-slate-400"}`}
          >
            Hyperliquid perps
          </Link>
          <Link
            href="/markets?venue=binance"
            className={`rounded border border-line px-3 py-2 ${venue === "binance" ? "bg-cyan-400/10 text-cyan-300" : "text-slate-400"}`}
          >
            Binance spot
          </Link>
        </div>
        {rows.length ? (
          <MarketScreener rows={rows} venue={venue} />
        ) : references.length ? (
          <ReferenceScreener rows={references} />
        ) : (
          <EmptyState
            icon={ListFilter}
            title="Market universe unavailable"
            copy="Sisera could not reach the venue or the reference provider. No cached or synthetic prices are shown."
            code="SCREENER / UNAVAILABLE"
          />
        )}
      </div>
    </div>
  );
}
