import { ArrowUpRight, CircleAlert, Landmark, RadioTower } from "lucide-react";
import Link from "next/link";
import { auth } from "../../../auth";
import { LiveRefresh } from "../../../components/live-refresh";
import { PageHeader } from "../../../components/page-header";
import { getPrivateMarkets } from "../../../lib/api";

export const dynamic = "force-dynamic";

function dollars(value: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(number)
    : "—";
}

function compact(value: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(number)
    : "—";
}

export default async function PrivateMarketsPage() {
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const markets = await getPrivateMarkets(identity).catch(() => []);
  const fetchedAt = markets[0]?.fetchedAt;

  return (
    <div className="min-h-full bg-ink">
      <PageHeader
        eyebrow="Solana / PreStocks Layer"
        title="PreStocks private markets"
        description="Dedicated pre-IPO market layer on Solana. Compare onchain token prices with latest issuer marks, track implied valuations, and analyze company intelligence before executing."
        actions={<LiveRefresh />}
      />
      <div className="space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <Landmark size={17} className="text-cyan-300" />
            <span className="text-sm font-semibold text-white">Private companies</span>
            <span className="rounded border border-line px-2 py-1 font-mono text-[10px] text-slate-400">
              {markets.length} assets
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
            <RadioTower size={12} /> Updated{" "}
            {fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : "unavailable"}
          </div>
        </div>
        {markets.length ? (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="border-b border-line bg-[#111d26] font-mono text-[10px] uppercase tracking-[.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 text-right font-medium">Token price</th>
                  <th className="px-4 py-3 text-right font-medium">Mark price</th>
                  <th className="px-4 py-3 text-right font-medium">Premium / discount</th>
                  <th className="px-4 py-3 text-right font-medium">Implied valuation</th>
                  <th className="px-4 py-3 text-right font-medium">Mark valuation</th>
                  <th className="px-4 py-3 text-right font-medium">Market value</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((market) => {
                  const premium = Number(market.premiumDiscountPct);
                  return (
                    <tr
                      key={market.instrument.id}
                      className="border-b border-line/70 last:border-0 hover:bg-white/[.025]"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-100">{market.company}</div>
                        <div className="mt-1 font-mono text-[10px] text-slate-500">
                          {market.instrument.baseAsset}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-100">
                        {dollars(market.tokenPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {dollars(market.markPrice)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${premium >= 0 ? "text-amber-300" : "text-emerald-300"}`}
                      >
                        {premium >= 0 ? "+" : ""}
                        {premium.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {compact(market.impliedValuation)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">
                        {compact(market.markValuation)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400">
                        {compact(market.marketCap)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/private-markets/${encodeURIComponent(market.instrument.baseAsset)}`}
                          className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-100"
                        >
                          Open <ArrowUpRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[.06] p-5 text-sm text-amber-100">
            <CircleAlert size={16} className="mt-0.5" /> Private-market prices are temporarily
            unavailable.
          </div>
        )}
      </div>
    </div>
  );
}
