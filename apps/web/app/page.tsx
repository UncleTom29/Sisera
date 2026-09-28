import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  ChartNoAxesCombined,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { SiseraMark } from "../components/sisera-mark";
import { getMarketOverview, getPrivateMarkets, getPublicStocks } from "../lib/api";

export const dynamic = "force-dynamic";

const money = (value: number | string | null | undefined, compact = false) =>
  value == null || !Number.isFinite(Number(value))
    ? null
    : Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        ...(compact
          ? { notation: "compact" as const, maximumFractionDigits: 1 }
          : { maximumFractionDigits: 2 }),
      }).format(Number(value));

export default async function LandingPage() {
  const [stocks, privateMarkets, overview] = await Promise.all([
    getPublicStocks({}).catch(() => []),
    getPrivateMarkets({}).catch(() => []),
    getMarketOverview({}).catch(() => null),
  ]);
  const stock =
    stocks.find((item) => item.symbol === "AAPLx" && item.dexPriceUsd) ??
    stocks.find((item) => item.dexPriceUsd);
  const privateAsset =
    privateMarkets.find((item) => item.instrument.baseAsset === "OPENAI") ?? privateMarkets[0];
  const crypto = (overview?.crypto ?? []).filter((item) => item.priceUsd != null).slice(0, 5);
  const rwa = (overview?.rwaStocks ?? [])
    .filter((item) => item.averageTokenPriceUsd != null)
    .sort((a, b) => (b.tokenizedVolume24hUsd ?? 0) - (a.tokenizedVolume24hUsd ?? 0))
    .slice(0, 4);

  return (
    <main className="min-h-screen bg-[#080e14] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080e14]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 md:px-10">
          <Link href="/" className="flex items-center gap-3" aria-label="Sisera home">
            <SiseraMark size={32} />
            <span className="text-[17px] font-semibold tracking-[0.16em] text-white">SISERA</span>
          </Link>
          <nav className="hidden items-center gap-7 text-xs text-slate-400 md:flex">
            <Link href="/stocks" className="hover:text-white">
              Markets
            </Link>
            <Link href="/intelligence" className="hover:text-white">
              Intelligence
            </Link>
            <Link href="/agents" className="hover:text-white">
              Agents
            </Link>
          </nav>
          <Link
            href="/stocks"
            className="inline-flex items-center gap-2 rounded-md bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#07151e] hover:bg-cyan-200"
          >
            Open Sisera <ArrowUpRight size={14} />
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute -right-32 -top-64 size-[750px] rounded-full bg-cyan-400/[0.06] blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-40 left-1/4 size-[550px] rounded-full bg-indigo-500/[0.06] blur-[100px]" />
        <div className="relative mx-auto grid max-w-[1440px] gap-12 px-5 py-20 md:px-10 md:py-28 xl:grid-cols-[1.15fr_.85fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-1.5 text-[11px] font-medium tracking-wide text-cyan-200">
              <Sparkles size={12} /> The stock market is moving onchain
            </div>
            <h1 className="mt-7 text-[clamp(3.1rem,6.5vw,7rem)] font-medium leading-[.98] tracking-[-.065em] text-[#f5f4ef]">
              Know more.
              <br />
              <span className="text-cyan-300">Move better.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-slate-300 md:text-lg">
              Public stocks, private markets, and crypto now share a trading screen. Sisera brings
              prices, context, research, and controls together so you can see the whole decision
              before you make it.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/stocks"
                className="inline-flex items-center gap-2 rounded-md bg-cyan-300 px-5 py-3 text-sm font-semibold text-[#07151e] hover:bg-cyan-200"
              >
                Explore markets <ArrowRight size={16} />
              </Link>
              <Link
                href="/intelligence"
                className="inline-flex items-center gap-2 rounded-md border border-white/15 px-5 py-3 text-sm font-medium text-slate-100 hover:border-white/40"
              >
                See what matters <ArrowUpRight size={15} />
              </Link>
            </div>
            <p className="mt-6 text-xs text-slate-500">
              Trade where available. Research and practice before putting capital to work.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111c25]/90 p-4 shadow-[0_40px_120px_rgba(0,0,0,.35)] md:p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[.18em] text-cyan-300">
                  Today in the market
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">Your wider view</h2>
              </div>
              <ChartNoAxesCombined size={21} className="text-cyan-300" />
            </div>
            <div className="grid grid-cols-2 gap-3 py-4">
              <div className="rounded-lg border border-white/10 bg-white/[.025] p-4">
                <p className="text-xs text-slate-500">Crypto market</p>
                <p className="mt-2 font-mono text-xl text-white">
                  {money(overview?.global?.marketCapUsd, true) ?? "Explore crypto"}
                </p>
                <p className="mt-2 text-[11px] text-slate-500">Total market value</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[.025] p-4">
                <p className="text-xs text-slate-500">Market mood</p>
                <p className="mt-2 font-mono text-xl text-white">
                  {overview?.sentiment ? `${overview.sentiment.score} / 100` : "See the signals"}
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  {overview?.sentiment?.label ?? "Macro and market context"}
                </p>
              </div>
            </div>
            {crypto.length ? (
              <div className="divide-y divide-white/10 border-t border-white/10">
                {crypto.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 py-3 text-xs"
                  >
                    <span className="font-medium text-slate-200">
                      {item.name} <span className="ml-1 text-slate-500">{item.symbol}</span>
                    </span>
                    <div className="text-right font-mono">
                      <span className="text-white">{money(item.priceUsd)}</span>
                      <span
                        className={`ml-3 ${item.change24hPct != null && item.change24hPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                      >
                        {item.change24hPct == null
                          ? ""
                          : `${item.change24hPct > 0 ? "+" : ""}${item.change24hPct.toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-t border-white/10 py-5">
                <p className="text-sm text-slate-300">
                  Discover tokenized equities, private companies, and crypto in one place.
                </p>
                <Link
                  href="/markets"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-300"
                >
                  Browse markets <ArrowRight size={12} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-16 md:px-10 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[.18em] text-cyan-300">
              Across the market
            </p>
            <h2 className="mt-3 text-3xl font-medium tracking-tight text-white md:text-4xl">
              Follow the assets shaping the next session.
            </h2>
          </div>
          <Link href="/stocks" className="inline-flex items-center gap-1 text-sm text-cyan-300">
            All markets <ArrowRight size={15} />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link
            href={stock ? `/stocks/${encodeURIComponent(stock.symbol)}` : "/stocks"}
            className="group rounded-xl border border-white/10 bg-[#111c25] p-6 hover:border-cyan-300/40"
          >
            <p className="text-xs text-cyan-300">Public stocks</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              {stock?.name ?? "Find your next stock"}
            </h3>
            <p className="mt-5 font-mono text-3xl text-white">
              {money(stock?.dexPriceUsd) ?? "Explore the market"}
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Compare token prices, liquidity, and the equity behind each asset.
            </p>
            <ArrowUpRight
              size={16}
              className="mt-5 text-cyan-300 transition-transform group-hover:translate-x-1"
            />
          </Link>
          <Link
            href={
              privateAsset
                ? `/private-markets/${encodeURIComponent(privateAsset.instrument.baseAsset)}`
                : "/private-markets"
            }
            className="group rounded-xl border border-white/10 bg-[#111c25] p-6 hover:border-cyan-300/40"
          >
            <p className="text-xs text-cyan-300">Private markets</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              {privateAsset?.company ?? "Explore private companies"}
            </h3>
            <p className="mt-5 font-mono text-3xl text-white">
              {money(privateAsset?.tokenPrice) ?? "Discover opportunities"}
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              See token prices alongside company marks, news, and market context.
            </p>
            <ArrowUpRight
              size={16}
              className="mt-5 text-cyan-300 transition-transform group-hover:translate-x-1"
            />
          </Link>
          <Link
            href="/intelligence"
            className="group rounded-xl border border-white/10 bg-[#111c25] p-6 hover:border-cyan-300/40 md:col-span-2 xl:col-span-1"
          >
            <p className="text-xs text-cyan-300">Market intelligence</p>
            <h3 className="mt-3 text-xl font-semibold text-white">The story behind the move</h3>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">
              See price gaps, liquidity, news, and broader market conditions together. Let Sisera
              help you ask the better question.
            </p>
            <ArrowUpRight
              size={16}
              className="mt-5 text-cyan-300 transition-transform group-hover:translate-x-1"
            />
          </Link>
        </div>
      </section>

      {rwa.length > 0 && (
        <section className="border-y border-white/10 bg-[#0d171f] px-5 py-14 md:px-10">
          <div className="mx-auto max-w-[1440px]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[.18em] text-cyan-300">
                  Tokenized equities
                </p>
                <h2 className="mt-3 text-2xl font-medium text-white md:text-3xl">
                  Where the onchain stock market is active.
                </h2>
              </div>
              <Link href="/stocks" className="text-xs text-cyan-300">
                Explore stocks →
              </Link>
            </div>
            <div className="mt-7 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
              {rwa.map((item) => (
                <div key={item.symbol} className="bg-[#111c25] p-5">
                  <p className="font-mono text-xs text-cyan-300">{item.symbol}</p>
                  <p className="mt-2 truncate text-sm font-semibold text-white">{item.name}</p>
                  <p className="mt-5 font-mono text-xl text-white">
                    {money(item.averageTokenPriceUsd)}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {money(item.tokenizedVolume24hUsd, true)} traded in 24h
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto grid max-w-[1440px] gap-12 px-5 py-20 md:px-10 md:py-28 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <p className="text-[11px] uppercase tracking-[.18em] text-cyan-300">
            Built for decisions
          </p>
          <h2 className="mt-4 text-3xl font-medium leading-tight tracking-tight text-white md:text-5xl">
            One place to go from curiosity to conviction.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
            Keep the market, the company, your portfolio, and the trade in view. Sisera gives each
            decision a clearer path from discovery to action.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: ChartNoAxesCombined,
              title: "See the whole market",
              body: "Screen tokenized stocks and private markets beside crypto and macro conditions.",
            },
            {
              icon: Sparkles,
              title: "Understand the move",
              body: "Bring prices, news, market depth, and AI research into the same conversation.",
            },
            {
              icon: Layers3,
              title: "Know your exposure",
              body: "See holdings and concentrations across connected wallets before adding a position.",
            },
            {
              icon: ShieldCheck,
              title: "Stay in control",
              body: "Practice, review trade details, and keep clear limits around execution and agents.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-white/10 bg-[#111c25] p-6">
              <Icon size={20} className="text-cyan-300" />
              <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
              <p className="mt-3 text-xs leading-6 text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#101c25] px-5 py-14 md:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-6">
          <div>
            <Bot size={22} className="text-cyan-300" />
            <h2 className="mt-3 text-2xl font-medium text-white">
              Build a strategy worth trusting.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Define your markets, capital, and risk limits. Explore ideas with AI, inspect the
              evidence, and test before moving further.
            </p>
          </div>
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 rounded-md border border-cyan-300/40 px-5 py-3 text-sm font-medium text-cyan-200 hover:bg-cyan-300/10"
          >
            Explore agents <ArrowRight size={15} />
          </Link>
        </div>
      </section>
      <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-5 px-5 py-10 text-xs text-slate-500 md:px-10">
        <span>Sisera · See further. Trade with intent.</span>
        <div className="flex flex-wrap gap-5">
          <Link href="/stocks" className="hover:text-white">
            Stocks
          </Link>
          <Link href="/private-markets" className="hover:text-white">
            Private markets
          </Link>
          <Link href="/portfolio" className="hover:text-white">
            Portfolio
          </Link>
          <Link href="/agents" className="hover:text-white">
            Agents
          </Link>
        </div>
        <span>Market information is for research. Review prices and risks before trading.</span>
      </footer>
    </main>
  );
}
