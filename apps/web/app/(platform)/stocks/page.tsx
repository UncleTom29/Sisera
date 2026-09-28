import { auth } from "../../../auth";
import { LiveRefresh } from "../../../components/live-refresh";
import { PageHeader } from "../../../components/page-header";
import { PublicStockScreener } from "../../../components/public-stock-screener";
import { getPublicStocks, getRwaStocks, getStockNews } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function StocksPage() {
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const [stocks, broaderMarket] = await Promise.all([
    getPublicStocks(identity).catch(() => []),
    getRwaStocks(identity).catch(() => []),
  ]);
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
        eyebrow="Stocks onchain"
        title="Public stocks"
        description="Find the companies you follow, compare the markets around their tokens, and see where activity is building."
        actions={<LiveRefresh />}
      />
      <PublicStockScreener stocks={stocks} />
      {broaderMarket.length > 0 && (
        <section className="m-4 rounded-lg border border-line bg-panel md:m-6">
          <div className="border-b border-line px-5 py-4">
            <p className="eyebrow">The wider market</p>
            <h2 className="mt-1 text-base font-semibold text-white">
              Tokenized stocks beyond one venue
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              Compare aggregate activity across tracked stock tokens. These figures cover multiple
              issuers and markets.
            </p>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
            {[...broaderMarket]
              .sort((a, b) => (b.tokenizedVolume24hUsd ?? 0) - (a.tokenizedVolume24hUsd ?? 0))
              .slice(0, 8)
              .map((asset) => (
                <div key={asset.symbol} className="bg-panel p-5">
                  <p className="font-mono text-xs text-cyan-300">{asset.symbol}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-white">{asset.name}</p>
                  <p className="mt-4 font-mono text-lg text-white">
                    {asset.averageTokenPriceUsd == null
                      ? "Price pending"
                      : `$${asset.averageTokenPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {asset.tokenizedVolume24hUsd == null
                      ? "Trading activity pending"
                      : `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(asset.tokenizedVolume24hUsd)} traded in 24h`}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}
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
