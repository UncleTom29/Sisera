import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "../../../../auth";
import { AssetTabs } from "../../../../components/asset-tabs";
import { LiveNumber } from "../../../../components/live-number";
import { StockAssessment } from "../../../../components/stock-assessment";
import { StockPriceChart } from "../../../../components/stock-price-chart";
import { StockTradeTicket } from "../../../../components/stock-trade-ticket";
import {
  getPublicStocks,
  getPythReference,
  getRwaDetail,
  getRwaTokenHistory,
  getSolanaTokenHistory,
  getStockNews,
} from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  const ticker = decodeURIComponent(symbol);
  return {
    title: `${ticker} price, premium to share, and news`,
    description: `Live ${ticker} token price on Solana compared with the underlying share, with liquidity, trading activity, and company news.`,
    alternates: { canonical: `/stocks/${encodeURIComponent(ticker)}` },
  };
}

const compact = (value: number | null | undefined) =>
  value == null ? "—" : `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(value)}`;

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
  const cmcToken = broaderMarket?.market?.tokens.find(
    (item) => item.symbol.toLowerCase() === stock.symbol.toLowerCase(),
  );
  const dexHistory = await getSolanaTokenHistory(stock.mint, "1h", identity).catch(() => []);
  const history =
    dexHistory.length > 1
      ? dexHistory
      : cmcToken?.cryptoId
        ? await getRwaTokenHistory(
            stock.underlyingSymbol,
            cmcToken.symbol,
            "daily",
            identity,
          ).catch(() => [])
        : [];
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
  const change = stock.change24hPct;
  const stats: Array<{ label: string; value: string; tone?: string }> = [
    {
      label: "24h change",
      value: change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`,
      tone: change == null ? "" : change >= 0 ? "text-[var(--up)]" : "text-[var(--down)]",
    },
    { label: "24h volume", value: compact(stock.volume24hUsd) },
    { label: "Liquidity", value: compact(stock.liquidityUsd) },
    {
      label: "Underlying share",
      value: referencePrice ? `$${referencePrice.toFixed(2)}` : "Pending",
    },
    {
      label: "Premium / discount",
      value: premium == null ? "Pending" : `${premium > 0 ? "+" : ""}${premium.toFixed(2)}%`,
      tone:
        premium == null
          ? "text-slate-400"
          : premium >= 0
            ? "text-bronze-300"
            : "text-verdigris-300",
    },
    {
      label: "Share price timing",
      value: reference?.referenceFreshness === "live" ? "Live" : "Market closed",
    },
  ];

  const comparison = (
    <div className="p-6">
      <p className="max-w-2xl text-[13px] leading-6 text-slate-400">
        How this token compares with the underlying share. The gap can reflect market hours,
        liquidity, and trading costs.
      </p>
      <dl className="mt-5 grid gap-px bg-line text-xs sm:grid-cols-2">
        {[
          [
            "Underlying share",
            referencePrice ? `$${referencePrice.toFixed(2)}` : "Latest price pending",
          ],
          [
            "Token price on Solana",
            stock.dexPriceUsd ? `$${Number(stock.dexPriceUsd).toFixed(2)}` : "—",
          ],
          [
            "Last share price",
            reference ? new Date(reference.feedUpdateTimestamp).toLocaleString() : "—",
          ],
          ["Price source", stock.dexPriceUsd ? "Solana market" : "Issuer price"],
        ].map(([label, value]) => (
          <div key={label} className="bg-panel py-3 pr-4">
            <dt className="text-slate-400">{label}</dt>
            <dd className="num mt-1.5 text-bone">{value}</dd>
          </div>
        ))}
        <div className="bg-panel py-3 sm:col-span-2">
          <dt className="text-slate-400">Token address for wallet verification</dt>
          <dd className="mt-1.5 break-all font-mono text-bone">{stock.mint}</dd>
        </div>
      </dl>
      {stock.chartUrl && (
        <a
          href={stock.chartUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1 text-xs text-bronze-300 hover:text-white"
        >
          View market chart <ArrowUpRight size={12} />
        </a>
      )}
    </div>
  );

  const company =
    broaderMarket && (broaderMarket.market || broaderMarket.profile) ? (
      <div className="p-6">
        {broaderMarket.profile?.description && (
          <p className="max-w-4xl text-sm leading-7 text-slate-300">
            {broaderMarket.profile.description}
          </p>
        )}
        <div className="mt-5 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Industry", broaderMarket.profile?.industry ?? "—"],
            ["Founded", broaderMarket.profile?.founded?.slice(0, 4) ?? "—"],
            ["Tokenized market value", compact(broaderMarket.market?.tokenizedMarketCapUsd)],
            ["24h token trading", compact(broaderMarket.market?.tokenizedVolume24hUsd)],
          ].map(([label, value]) => (
            <div key={label} className="bg-ink p-4">
              <p className="data-label">{label}</p>
              <p className="mt-2 text-sm font-medium text-bone">{value}</p>
            </div>
          ))}
        </div>
        {broaderMarket.market?.tokens.length ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-bone">Other versions of this stock</h3>
            <div className="mt-3 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
              {broaderMarket.market.tokens.slice(0, 6).map((token) => (
                <div key={`${token.symbol}-${token.issuer}`} className="bg-ink p-4">
                  <p className="font-mono text-xs text-bronze-300">{token.symbol}</p>
                  <p className="mt-1 truncate text-xs text-slate-300">{token.name}</p>
                  <p className="num mt-2 text-sm text-bone">
                    {token.priceUsd == null ? "—" : `$${token.priceUsd.toFixed(2)}`}
                  </p>
                  {token.issuer && (
                    <p className="mt-1 text-[11px] text-slate-400">Issued by {token.issuer}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <p className="mt-4 text-[11px] text-slate-400">
          Market-wide token figures combine multiple issuers and are separate from the Solana price
          in the trade ticket.
        </p>
      </div>
    ) : null;

  const newsPanel = news?.data.length ? (
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
          <p className="mt-2 font-mono text-[11px] text-slate-400">
            {article.publisher} · {new Date(article.publishedAt).toLocaleString()}
          </p>
        </a>
      ))}
    </div>
  ) : (
    <p className="p-6 text-sm text-slate-400">No recent headlines from connected news sources.</p>
  );

  return (
    <div className="min-h-full bg-ink">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-5 sm:px-6">
        <div>
          <p className="data-label text-bronze-300">
            {stock.underlyingSymbol} · Tokenized stock · Solana
          </p>
          <h1 className="display mt-2 text-[32px] leading-tight text-bone">{stock.name}</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl text-bone">
            <LiveNumber
              value={price ? Number(price) : null}
              display={price ? `$${Number(price).toFixed(2)}` : "—"}
            />
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {stock.dexPriceUsd ? "Solana market" : "Issuer price"} · updated{" "}
            {new Date(stock.fetchedAt).toLocaleTimeString()}
          </p>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-panel px-4 py-3.5 sm:px-6">
            <dt className="data-label">{stat.label}</dt>
            <dd className={`num mt-1.5 text-lg text-bone ${stat.tone ?? ""}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <StockPriceChart
            token={stock.symbol}
            scope={
              dexHistory.length > 1
                ? "Solana token trading"
                : "Token trading across tracked markets"
            }
            history={history}
            current={
              dexHistory.length > 1 ? null : (cmcToken?.priceUsd ?? (price ? Number(price) : null))
            }
            currentAt={
              dexHistory.length > 1 ? null : (broaderMarket?.market?.updatedAt ?? stock.fetchedAt)
            }
          />
          <AssetTabs
            tabs={[
              { id: "compare", label: "Token vs share", panel: comparison },
              ...(company ? [{ id: "company", label: "Company", panel: company }] : []),
              { id: "news", label: "News", panel: newsPanel },
            ]}
          />
          <StockAssessment symbol={stock.symbol} />
        </div>
        <div className="self-start lg:sticky lg:top-4">
          <StockTradeTicket
            mint={stock.mint}
            symbol={stock.symbol}
            price={price}
            halted={stock.tradingHalted}
          />
        </div>
      </div>
    </div>
  );
}
