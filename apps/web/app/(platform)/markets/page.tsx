import { ListFilter } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { SpotScreener } from "../../../components/spot-screener";
import { getSpotUniverse } from "../../../lib/api";

export const metadata: Metadata = {
  title: "Crypto spot",
  description: "Every Binance USDT spot pair with live prices, 24h change, range, and volume.",
};

export const dynamic = "force-dynamic";

export default async function MarketsPage({
  searchParams,
}: { searchParams: Promise<{ venue?: string }> }) {
  if ((await searchParams).venue === "hyperliquid") redirect("/terminal?venue=hyperliquid");
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const markets = await getSpotUniverse(identity).catch(() => []);
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Markets / Crypto spot"
        title="Crypto spot markets"
        description="Every actively traded Binance USDT pair, with prices streamed live."
      />
      <div className="p-4 md:p-6">
        <div className="mb-4 flex gap-2 text-xs">
          <Link
            href="/terminal?venue=hyperliquid"
            className="border border-line px-3 py-2 text-slate-300 hover:text-bone"
          >
            Hyperliquid perpetuals
          </Link>
          <span className="border border-line bg-bronze-400/10 px-3 py-2 text-bronze-200">
            Binance spot
          </span>
        </div>
        {markets.length ? (
          <SpotScreener markets={markets} />
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
