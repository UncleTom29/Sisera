import { ArrowUpRight, CircleAlert, RadioTower } from "lucide-react";
import Link from "next/link";
import { auth } from "../auth";
import { getPrivateMarkets, getStockNews } from "../lib/api";
import { PageHeader } from "./page-header";

export async function StockIntelligence() {
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const assets = await getPrivateMarkets(identity).catch(() => []);
  const ranked = [...assets].sort(
    (left, right) =>
      Math.abs(Number(right.premiumDiscountPct)) - Math.abs(Number(left.premiumDiscountPct)),
  );
  const coverage = await Promise.allSettled(
    assets.slice(0, 3).map((asset) => getStockNews(asset.instrument.baseAsset, identity)),
  );
  const articles = coverage
    .flatMap((result) => (result.status === "fulfilled" ? result.value.data : []))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, 8);

  return (
    <div className="min-h-full bg-ink">
      <PageHeader
        eyebrow="Multi-Dimensional Intelligence / Evidence"
        title="Stock intelligence"
        description="Market microstructure, valuation divergence against Pyth and PreStocks marks, macroeconomic context, verified company announcements, and corroborated news events."
        actions={
          <Link
            href="/intelligence?universe=perps"
            className="rounded border border-line px-3 py-2 text-xs text-slate-400 hover:text-white"
          >
            Perpetuals research →
          </Link>
        }
      />
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)] md:p-6">
        <section className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="eyebrow">PreStocks / Mark divergence</p>
              <h2 className="mt-1 text-base font-semibold text-white">Largest observed gaps</h2>
            </div>
            <RadioTower size={16} className="text-cyan-300" />
          </div>
          {ranked.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[590px] text-left text-xs">
                <thead className="border-b border-line font-mono text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Company</th>
                    <th className="px-5 py-3 text-right font-medium">Token</th>
                    <th className="px-5 py-3 text-right font-medium">Issuer mark</th>
                    <th className="px-5 py-3 text-right font-medium">Premium / discount</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((asset) => {
                    const gap = Number(asset.premiumDiscountPct);
                    return (
                      <tr
                        key={asset.instrument.id}
                        className="border-b border-line/70 last:border-0 hover:bg-white/[.025]"
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/private-markets/${encodeURIComponent(asset.instrument.baseAsset)}`}
                            className="inline-flex items-center gap-1 font-semibold text-slate-100 hover:text-cyan-300"
                          >
                            {asset.company}
                            <ArrowUpRight size={12} />
                          </Link>
                          <p className="mt-1 font-mono text-[10px] text-slate-500">
                            {asset.instrument.baseAsset} · Solana
                          </p>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-slate-200">
                          ${Number(asset.tokenPrice).toFixed(2)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-slate-400">
                          ${Number(asset.markPrice).toFixed(2)}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-mono ${gap > 0 ? "text-amber-300" : "text-emerald-300"}`}
                        >
                          {gap > 0 ? "+" : ""}
                          {gap.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-5 text-sm text-slate-400">
              <CircleAlert size={16} /> PreStocks feed unavailable. No signals are shown.
            </div>
          )}
          <p className="border-t border-line px-5 py-3 font-mono text-[10px] text-slate-500">
            Source: PreStocks · fetched{" "}
            {assets[0] ? new Date(assets[0].fetchedAt).toLocaleString() : "unavailable"} · issuer
            source timestamp not provided
          </p>
        </section>
        <section className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line px-5 py-4">
            <p className="eyebrow">Company events</p>
            <h2 className="mt-1 text-base font-semibold text-white">Recent coverage</h2>
          </div>
          {articles.length ? (
            <div className="divide-y divide-line">
              {articles.map((article) => (
                <a
                  key={article.url}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-5 py-4 hover:bg-white/[.025]"
                >
                  <p className="text-xs font-medium leading-5 text-slate-100">{article.title}</p>
                  <p className="mt-2 font-mono text-[10px] text-slate-500">
                    {article.publisher} · {new Date(article.publishedAt).toLocaleString()}
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-slate-400">
              No configured company-news source returned articles. GNews free-tier coverage can be
              delayed.
            </p>
          )}
        </section>
      </div>
      <p className="px-6 pb-6 text-xs leading-5 text-slate-500">
        A mark gap alone is not an arbitrage signal. Liquidity, redemption, transfer restrictions,
        eligibility, underlying rights, and executable route are not verified by this view.
      </p>
    </div>
  );
}
