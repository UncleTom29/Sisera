import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { auth } from "../../../auth";
import { LiveRefresh } from "../../../components/live-refresh";
import { PageHeader } from "../../../components/page-header";
import { getPublicStocks, getStockNews } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function StocksPage() {
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const stocks = await getPublicStocks(identity).catch(() => []);
  const newsResults = await Promise.allSettled(
    stocks.slice(0, 4).map((stock) => getStockNews(stock.symbol, identity)),
  );
  const news = [
    ...new Map(
      newsResults
        .flatMap((result) => (result.status === "fulfilled" ? result.value.data : []))
        .map((item) => [item.url, item]),
    ).values(),
  ]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 8);
  return (
    <div className="min-h-full bg-ink">
      <PageHeader
        eyebrow="Solana / Tokenized Equities"
        title="Public stocks"
        description="Tokenized public equities on Solana with Pyth reference pricing, premium/discount measurement, and 24/7 onchain market execution."
        actions={<LiveRefresh />}
      />
      <section className="m-4 overflow-hidden rounded-lg border border-line bg-panel md:m-6">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Public stocks</h2>
            <p className="mt-1 text-xs text-slate-400">
              {stocks.length} companies and funds · Prices update automatically
            </p>
          </div>
          <Link href="/private-markets" className="text-xs text-cyan-300 hover:text-white">
            Private markets <ArrowUpRight size={12} className="inline" />
          </Link>
        </div>
        {stocks.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="border-b border-line bg-[#111d26] text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Token</th>
                  <th className="px-5 py-3 text-right font-medium">Price</th>
                  <th className="px-5 py-3 text-right font-medium">24h</th>
                  <th className="px-5 py-3 text-right font-medium">Volume</th>
                  <th className="px-5 py-3 text-right font-medium">Liquidity</th>
                  <th className="px-5 py-3 text-right font-medium">Trade</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock) => (
                  <tr
                    key={stock.mint}
                    className="border-b border-line/60 last:border-0 hover:bg-white/[.025]"
                  >
                    <td className="px-5 py-3 font-semibold text-slate-100">{stock.name}</td>
                    <td className="px-5 py-3 font-mono text-slate-400">{stock.symbol}</td>
                    <td className="px-5 py-3 text-right font-mono text-slate-100">
                      {stock.dexPriceUsd || stock.priceUsd
                        ? `$${Number(stock.dexPriceUsd ?? stock.priceUsd).toFixed(2)}`
                        : "—"}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-mono ${stock.change24hPct == null ? "text-slate-500" : stock.change24hPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {stock.change24hPct == null
                        ? "—"
                        : `${stock.change24hPct > 0 ? "+" : ""}${stock.change24hPct.toFixed(2)}%`}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-300">
                      {stock.volume24hUsd == null
                        ? "—"
                        : `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(stock.volume24hUsd)}`}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-300">
                      {stock.liquidityUsd == null
                        ? "—"
                        : `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(stock.liquidityUsd)}`}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/stocks/${encodeURIComponent(stock.symbol)}`}
                        className="text-cyan-300 hover:text-white"
                      >
                        Open <ArrowUpRight size={12} className="inline" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-slate-400">
            Stock prices are temporarily unavailable.
          </p>
        )}
      </section>
      <section className="m-4 border border-line bg-panel md:m-6">
        <h2 className="border-b border-line px-5 py-4 text-sm font-semibold text-white">
          Recent stock news
        </h2>
        {news.length ? (
          <div className="divide-y divide-line">
            {news.map((item) => (
              <a
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-5 py-3 hover:bg-white/[.025]"
              >
                <p className="text-xs font-medium text-slate-100">{item.title}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">
                  {item.publisher} · {new Date(item.publishedAt).toLocaleString()}
                </p>
              </a>
            ))}
          </div>
        ) : (
          <p className="p-5 text-xs text-slate-400">
            No current articles returned by connected news sources.
          </p>
        )}
      </section>
    </div>
  );
}
