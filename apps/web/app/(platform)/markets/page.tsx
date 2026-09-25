import { StatusBadge } from "@sisera/ui";
import { ListFilter } from "lucide-react";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { LiveRefresh } from "../../../components/live-refresh";
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
        eyebrow="Discover / Crypto spot"
        title="Markets"
        description="A live view of listed spot pairs, with clear source and update times. Select a market to inspect its chart and order book."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={rows.length ? "positive" : "negative"}>
              {rows.length ? `${rows.length} markets live` : "Provider unavailable"}
            </StatusBadge>
            <LiveRefresh />
          </div>
        }
      />
      <div className="p-4 md:p-6">
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
