import { StatusBadge } from "@sisera/ui";
import { ListFilter } from "lucide-react";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { MarketScreener } from "../../../components/market-screener";
import { PageHeader } from "../../../components/page-header";
import { getMarkets } from "../../../lib/api";

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

export default async function MarketsPage() {
  const session = await auth();
  const result = await getMarkets(symbols, {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  }).catch(() => null);
  const rows = result?.data ?? [];
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Cross-venue discovery"
        title="Market screener"
        description="Source-labelled spot markets with sortable liquidity, spread, price action, and direct access to the trading workspace."
        actions={
          <StatusBadge tone={rows.length ? "positive" : "negative"}>
            {rows.length ? `${rows.length} markets live` : "Provider unavailable"}
          </StatusBadge>
        }
      />
      <div className="p-4">
        {rows.length ? (
          <MarketScreener rows={rows} />
        ) : (
          <EmptyState
            icon={ListFilter}
            title="Market universe unavailable"
            copy="Sisera could not verify the configured venue. No cached or synthetic prices are shown."
            code="SCREENER / UNAVAILABLE"
          />
        )}
      </div>
    </div>
  );
}
