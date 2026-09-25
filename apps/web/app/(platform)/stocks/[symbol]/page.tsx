import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "../../../../auth";
import { StockTradeTicket } from "../../../../components/stock-trade-ticket";
import { getPublicStocks, getStockNews } from "../../../../lib/api";

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
  const news = await getStockNews(stock.symbol, identity).catch(() => null);
  const price = stock.dexPriceUsd ?? stock.priceUsd;
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
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-line bg-panel p-6">
          <h2 className="text-base font-semibold text-white">Market details</h2>
          <div className="mt-5 grid gap-4 text-xs sm:grid-cols-2">
            <div>
              <p className="text-slate-500">Issuer price</p>
              <p className="mt-2 font-mono text-white">
                {stock.priceUsd ? `$${Number(stock.priceUsd).toFixed(2)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Solana market price</p>
              <p className="mt-2 font-mono text-white">
                {stock.dexPriceUsd ? `$${Number(stock.dexPriceUsd).toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-slate-500">Token address</p>
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
        <StockTradeTicket
          mint={stock.mint}
          symbol={stock.symbol}
          price={price}
          halted={stock.tradingHalted}
        />
      </div>
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
          <p className="p-6 text-sm text-slate-400">No recent headlines found.</p>
        )}
      </section>
    </div>
  );
}
