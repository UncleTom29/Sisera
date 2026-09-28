import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "../../../../auth";
import { StockAssessment } from "../../../../components/stock-assessment";
import { StockTradeTicket } from "../../../../components/stock-trade-ticket";
import { getPublicStocks, getPythReference, getRwaDetail, getStockNews } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export default async function PublicStockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const stocks = await getPublicStocks(identity).catch(() => []);
  const stock = stocks.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase());
  if (!stock) notFound();
  const [news, reference, broaderMarket] = await Promise.all([
    getStockNews(stock.symbol, identity).catch(() => null),
    getPythReference(stock.underlyingSymbol, identity).catch(() => null),
    getRwaDetail(stock.underlyingSymbol, identity).catch(() => null),
  ]);
  const price = stock.dexPriceUsd ?? stock.priceUsd;
  const referencePrice = reference ? Number(reference.price) : null;
  const tokenPrice = stock.dexPriceUsd ? Number(stock.dexPriceUsd) : null;
  const premium =
    reference &&
    reference.referenceFreshness !== "stale" &&
    referencePrice &&
    referencePrice > 0 &&
    tokenPrice
      ? (tokenPrice / referencePrice - 1) * 100
      : null;
  return (
    <div className="min-h-full bg-ink p-4 md:p-8">
      <Link
        href="/stocks"
        className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"
      >
        <ArrowLeft size={14} /> Stocks
      </Link>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow">Public stocks / {stock.symbol}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{stock.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{stock.underlyingSymbol} · Solana</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl text-white">
            {price ? `$${Number(price).toFixed(2)}` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stock.dexPriceUsd ? "Solana market" : "Issuer price"} · updated{" "}
            {new Date(stock.fetchedAt).toLocaleTimeString()}
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        {[
          [
            "24h change",
            stock.change24hPct == null
              ? "—"
              : `${stock.change24hPct > 0 ? "+" : ""}${stock.change24hPct.toFixed(2)}%`,
          ],
          [
            "24h volume",
            stock.volume24hUsd == null
              ? "—"
              : `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(stock.volume24hUsd)}`,
          ],
          [
            "Liquidity",
            stock.liquidityUsd == null
              ? "—"
              : `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(stock.liquidityUsd)}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="bg-panel p-5">
            <p className="data-label">{label}</p>
            <p className="mt-3 font-mono text-xl text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-lg border border-line bg-panel p-6">
          <h2 className="text-base font-semibold text-white">Two sides of the market</h2>
          <p className="mt-2 text-xs text-slate-400">
            See how this token compares with the underlying share. The difference can reflect market
            hours, liquidity, and trading costs.
          </p>
          <div className="mt-5 grid gap-4 text-xs sm:grid-cols-2">
            <div>
              <p className="text-slate-500">Underlying share</p>
              <p className="mt-2 font-mono text-white">
                {referencePrice ? `$${referencePrice.toFixed(2)}` : "Latest price pending"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Token price on Solana</p>
              <p className="mt-2 font-mono text-white">
                {stock.dexPriceUsd ? `$${Number(stock.dexPriceUsd).toFixed(2)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Token premium / discount</p>
              <p
                className={`mt-2 font-mono ${premium == null ? "text-slate-400" : premium >= 0 ? "text-amber-300" : "text-emerald-300"}`}
              >
                {premium == null
                  ? "Comparison pending"
                  : `${premium > 0 ? "+" : ""}${premium.toFixed(2)}%`}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Price timing</p>
              <p className="mt-2 font-mono text-white">
                {reference?.referenceFreshness === "live" ? "Current" : "Outside live market hours"}
              </p>
              {reference && (
                <p className="mt-1 text-[10px] text-slate-500">
                  Last share price {new Date(reference.feedUpdateTimestamp).toLocaleString()}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <p className="text-slate-500">Token address for wallet verification</p>
              <p className="mt-2 break-all font-mono text-white">{stock.mint}</p>
            </div>
          </div>
          {stock.chartUrl && (
            <a
              href={stock.chartUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-white"
            >
              View market chart <ArrowUpRight size={12} />
            </a>
          )}
        </section>
        <div className="self-start lg:sticky lg:top-4">
          <StockTradeTicket
            mint={stock.mint}
            symbol={stock.symbol}
            price={price}
            halted={stock.tradingHalted}
          />
        </div>
      </div>
      {broaderMarket && (broaderMarket.market || broaderMarket.profile) && (
        <section className="mt-5 rounded-lg border border-line bg-panel p-6">
          <p className="eyebrow">Company and token landscape</p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            A broader view of {stock.underlyingSymbol}
          </h2>
          {broaderMarket.profile?.description && (
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
              {broaderMarket.profile.description}
            </p>
          )}
          <div className="mt-5 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Industry", broaderMarket.profile?.industry ?? "Explore company news"],
              ["Founded", broaderMarket.profile?.founded?.slice(0, 4) ?? "Company profile"],
              [
                "Tokenized market value",
                broaderMarket.market?.tokenizedMarketCapUsd == null
                  ? "Market view"
                  : `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(broaderMarket.market.tokenizedMarketCapUsd)}`,
              ],
              [
                "24h token trading",
                broaderMarket.market?.tokenizedVolume24hUsd == null
                  ? "Activity view"
                  : `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(broaderMarket.market.tokenizedVolume24hUsd)}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="bg-ink p-4">
                <p className="data-label">{label}</p>
                <p className="mt-2 text-sm font-medium text-white">{value}</p>
              </div>
            ))}
          </div>
          {broaderMarket.market?.tokens.length ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-white">Other versions of this stock</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {broaderMarket.market.tokens.slice(0, 6).map((token) => (
                  <div
                    key={`${token.symbol}-${token.issuer}`}
                    className="rounded border border-line bg-ink p-3"
                  >
                    <p className="font-mono text-xs text-cyan-300">{token.symbol}</p>
                    <p className="mt-1 truncate text-xs text-slate-300">{token.name}</p>
                    <p className="mt-2 font-mono text-sm text-white">
                      {token.priceUsd == null
                        ? "Explore this token"
                        : `$${token.priceUsd.toFixed(2)}`}
                    </p>
                    {token.issuer && (
                      <p className="mt-1 text-[10px] text-slate-500">Issued by {token.issuer}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="mt-4 text-[10px] text-slate-500">
            Market-wide token figures combine multiple issuers and are separate from the Solana
            price in the trade ticket.
          </p>
        </section>
      )}
      <StockAssessment symbol={stock.symbol} />
      <section className="mt-5 rounded-lg border border-line bg-panel">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-white">Company news</h2>
        </div>
        {news?.data.length ? (
          <div className="divide-y divide-line">
            {news.data.slice(0, 10).map((article) => (
              <a
                key={article.url}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-6 py-4 hover:bg-white/[.03]"
              >
                <p className="text-sm text-slate-100">{article.title}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {article.publisher} · {new Date(article.publishedAt).toLocaleString()}
                </p>
              </a>
            ))}
          </div>
        ) : (
          <p className="p-6 text-sm text-slate-400">
            Browse the company profile and market activity above while the next headlines arrive.
          </p>
        )}
      </section>
    </div>
  );
}
