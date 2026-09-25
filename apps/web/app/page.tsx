import { Button } from "@sisera/ui";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Compass,
  FileCheck2,
  Globe2,
  Landmark,
  Lock,
  Newspaper,
  Radio,
  Scale,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { SiseraMark } from "../components/sisera-mark";
import { getPrivateMarkets, getPublicStocks } from "../lib/api";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [stocks, privateMarkets] = await Promise.all([
    getPublicStocks({ localOperator: true }).catch(() => []),
    getPrivateMarkets({ localOperator: true }).catch(() => []),
  ]);

  const preStocksAssets = [
    {
      company: "OpenAI",
      symbol: "OPENAI",
      tokenPrice: 492.0,
      markPrice: 450.0,
      premiumDiscountPct: 9.33,
      impliedValuation: "$157.4B",
      markValuation: "$144.0B",
    },
    {
      company: "SpaceX",
      symbol: "SPACEX",
      tokenPrice: 118.5,
      markPrice: 112.0,
      premiumDiscountPct: 5.8,
      impliedValuation: "$210.0B",
      markValuation: "$198.5B",
    },
    {
      company: "Anthropic",
      symbol: "ANTHROPIC",
      tokenPrice: 34.2,
      markPrice: 35.0,
      premiumDiscountPct: -2.29,
      impliedValuation: "$18.1B",
      markValuation: "$18.5B",
    },
    {
      company: "Neuralink",
      symbol: "NEURALINK",
      tokenPrice: 72.0,
      markPrice: 70.0,
      premiumDiscountPct: 2.86,
      impliedValuation: "$8.2B",
      markValuation: "$8.0B",
    },
  ];

  return (
    <main className="min-h-screen bg-ink text-slate-100 selection:bg-cyan-300/20">
      {/* Clean Header: Brand + Single Action */}
      <header className="sticky top-0 z-40 border-b border-line bg-[#101b23]">
        <div className="mx-auto flex h-[70px] max-w-[1560px] items-center justify-between px-5 md:px-10">
          <Link href="/" className="flex items-center gap-3" aria-label="Sisera home">
            <SiseraMark size={32} />
            <span className="text-[17px] font-semibold tracking-[0.14em] text-white">SISERA</span>
          </Link>

          <Button
            asChild
            variant="primary"
            className="rounded border border-cyan-300 bg-cyan-300 text-xs font-semibold text-[#14202a] hover:bg-cyan-200"
          >
            <Link href="/stocks" className="flex items-center gap-1.5">
              Launch Terminal <ArrowUpRight size={15} />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-line bg-ink py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="max-w-4xl">
            <p className="eyebrow">Solana Financial Terminal</p>

            <h1 className="mt-6 text-[clamp(2.6rem,5vw,5.2rem)] font-medium leading-[1.04] tracking-[-0.05em] text-[#f4f0e9]">
              Tokenized equities, private markets, and persistent trading agents.
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-lg md:leading-8">
              Sisera gives traders one place to discover markets, understand what is moving them,
              compare onchain prices with reference values, execute trades, manage portfolios,
              measure risk, and deploy agents that trade continuously within explicit capital and
              risk limits.
            </p>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
              Instead of treating tokenized stocks as isolated SPL tokens with a chart and swap
              button, Sisera treats them as financial instruments: every market has reference
              pricing, valuation context, liquidity analysis, portfolio exposure, execution quality,
              news and event intelligence, and an auditable history of how both humans and agents
              acted on it.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                variant="primary"
                size="lg"
                className="rounded border border-cyan-300 bg-cyan-300 text-xs font-semibold text-[#14202a] hover:bg-cyan-200"
              >
                <Link href="/stocks" className="flex items-center gap-2">
                  Launch Terminal <ArrowRight size={15} />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                className="rounded border border-line bg-panel text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
              >
                <Link href="/private-markets">PreStocks Private Markets</Link>
              </Button>
              <Button
                asChild
                size="lg"
                className="rounded border border-line bg-transparent text-xs font-semibold text-slate-400 hover:border-slate-500 hover:text-white"
              >
                <Link href="/clawpump">Clawpump Agent Markets</Link>
              </Button>
            </div>
          </div>

          {/* Hero Live Market Snapshot */}
          <div className="mt-14 overflow-hidden rounded-lg border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-3 text-xs">
              <span className="font-semibold text-white">Market Overview</span>
              <span className="font-mono text-[11px] text-slate-400">Pyth & PreStocks Feeds</span>
            </div>

            <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-y-0 lg:divide-x">
              {/* OpenAI PreStocks */}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">OpenAI</span>
                    <span className="font-mono text-[10px] text-slate-400">PreStocks</span>
                  </div>
                  <span className="font-mono text-xs text-amber-300">+9.33% Premium</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-xl font-bold text-white">$492.00</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">Token</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm text-slate-400">$450.00</span>
                    <span className="ml-1.5 font-mono text-[11px] text-slate-500">Mark</span>
                  </div>
                </div>
                <div className="mt-3 border-t border-line/60 pt-2 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Implied Valuation:</span>
                    <span className="font-mono text-slate-200">$157.4B</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Secondary valuation reflects recent funding round pricing.
                </p>
                <Link
                  href="/private-markets/OPENAI"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                >
                  View valuation details <ArrowUpRight size={13} />
                </Link>
              </div>

              {/* Public Equities (AAPL) */}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">AAPL/USD</span>
                    <span className="font-mono text-[10px] text-slate-400">Tokenized Stock</span>
                  </div>
                  <span className="font-mono text-xs text-emerald-300">+0.06% Divergence</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-xl font-bold text-white">$228.45</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">Solana</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm text-slate-400">$228.30</span>
                    <span className="ml-1.5 font-mono text-[11px] text-slate-500">Pyth</span>
                  </div>
                </div>
                <div className="mt-3 border-t border-line/60 pt-2 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Market Session:</span>
                    <span className="font-mono text-slate-200">24/7 Onchain Trading</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Continuous fair-value tracking against Pyth traditional equity feeds.
                </p>
                <Link
                  href="/stocks/AAPL"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                >
                  View reference pricing <ArrowUpRight size={13} />
                </Link>
              </div>

              {/* Persistent Trading Agent */}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">BTC Trend Follower</span>
                    <span className="font-mono text-[10px] text-slate-400">Agent</span>
                  </div>
                  <span className="font-mono text-xs text-cyan-300">Policy Mode</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-xl font-bold text-white">$100,000</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">Capital Cap</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm text-slate-400">3.5%</span>
                    <span className="ml-1.5 font-mono text-[11px] text-slate-500">Max DD</span>
                  </div>
                </div>
                <div className="mt-3 border-t border-line/60 pt-2 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Monitoring:</span>
                    <span className="font-mono text-emerald-300">Active 24/7</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Executes orders strictly within declarative risk limits and Pyth triggers.
                </p>
                <Link
                  href="/agents"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                >
                  View agent framework <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Intelligence Section */}
      <section className="border-b border-line bg-[#0e161d] py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <p className="eyebrow">Market Intelligence</p>
              <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white">
                Intelligence that understands more than the chart.
              </h2>
              <p className="mt-6 text-base leading-8 text-slate-300">
                Sisera’s intelligence layer combines technical structure, market microstructure,
                valuation, portfolio context, global macro conditions, live news, company-specific
                announcements, regulatory developments, social information, and market-moving rumors
                rather than reducing every asset to indicators on a candlestick chart.
              </p>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                For every supported stock or private-market asset, Sisera continuously follows
                earnings and guidance, product launches, fundraising, acquisitions, executive
                changes, lawsuits, government actions, economic releases, rates, verified company
                announcements, and emerging rumors.
              </p>

              <div className="mt-6 rounded border border-line bg-panel p-4">
                <p className="text-xs font-semibold text-white">Rigorous Event Classification</p>
                <p className="mt-1 text-xs leading-6 text-slate-300">
                  News is classified by source, recency, corroboration, relevance, severity, and
                  affected assets so a rumor is not presented with the same certainty as an official
                  regulatory filing or company announcement.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded border border-line bg-panel p-5">
                <h3 className="text-sm font-semibold text-white">
                  Questions Sisera Answers in Real Time
                </h3>
                <div className="mt-4 space-y-2.5">
                  {[
                    {
                      q: "“Why is this asset moving?”",
                      desc: "Connects price changes with recent announcements, filings, and microstructure shifts.",
                    },
                    {
                      q: "“What changed in the last hour?”",
                      desc: "Highlights verified news and breaking rumors ranked by severity.",
                    },
                    {
                      q: "“Which of my positions are exposed to this event?”",
                      desc: "Maps macro developments and regulatory news directly to your holdings.",
                    },
                    {
                      q: "“Which tokenized stocks are trading furthest from fair value?”",
                      desc: "Measures onchain prices against Pyth equity reference feeds.",
                    },
                    {
                      q: "“What would adding this position do to my portfolio risk?”",
                      desc: "Calculates concentration, liquidity changes, and scenario impact before execution.",
                    },
                  ].map((item) => (
                    <div
                      key={item.q}
                      className="rounded border border-line/60 bg-[#101b23] p-3 text-xs"
                    >
                      <p className="font-semibold text-cyan-200">{item.q}</p>
                      <p className="mt-1 text-slate-400">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pyth Fair Value */}
              <div className="rounded border border-line bg-panel p-5">
                <div className="flex items-center gap-2">
                  <Scale size={18} className="text-cyan-300" />
                  <h3 className="text-sm font-semibold text-white">
                    Pyth Reference-Market & Fair-Value Layer
                  </h3>
                </div>
                <p className="mt-2 text-xs leading-6 text-slate-300">
                  For public tokenized equities, Sisera compares the onchain token with Pyth’s
                  corresponding traditional equity feed, continuously measuring premium or discount,
                  divergence, stale-price risk, confidence, market-session effects, and potential
                  dislocations between traditional financial markets and 24/7 Solana trading.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PreStocks Private Markets */}
      <section className="border-b border-line bg-ink py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="eyebrow">Pre-IPO Markets</p>
              <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white">
                Private markets with PreStocks.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
                PreStocks is integrated as Sisera’s dedicated pre-IPO market layer. PreStocks assets
                are brought directly into the same market terminal as tokenized public equities,
                with company-specific research, token price, mark price, implied valuation,
                liquidity, and market intelligence.
              </p>
            </div>
            <Link
              href="/private-markets"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
            >
              Explore PreStocks directory <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {preStocksAssets.map((asset) => (
              <div
                key={asset.symbol}
                className="flex flex-col justify-between rounded border border-line bg-panel p-5"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-white">{asset.company}</h3>
                      <p className="font-mono text-[10px] text-slate-500">{asset.symbol}</p>
                    </div>
                    <span
                      className={`font-mono text-xs font-medium ${asset.premiumDiscountPct >= 0 ? "text-amber-300" : "text-emerald-300"}`}
                    >
                      {asset.premiumDiscountPct > 0 ? "+" : ""}
                      {asset.premiumDiscountPct.toFixed(2)}%
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 border-y border-line py-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Token Price:</span>
                      <span className="font-mono text-white">${asset.tokenPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Issuer Mark:</span>
                      <span className="font-mono text-slate-300">
                        ${asset.markPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Implied Valuation:</span>
                      <span className="font-mono text-slate-200">{asset.impliedValuation}</span>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/private-markets/${asset.symbol}`}
                  className="mt-4 inline-flex items-center justify-center gap-1 rounded border border-line bg-[#101b23] py-2 text-xs text-slate-300 hover:border-cyan-300 hover:text-cyan-300"
                >
                  Inspect valuation <ChevronRight size={13} />
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs leading-6 text-slate-400">
            Sisera uses PreStocks exclusively for pre-IPO token exposure rather than mixing
            competing providers, allowing traders to rank assets by valuation divergence, liquidity,
            momentum, risk, news intensity, or portfolio fit and move directly from research into
            execution.
          </p>
        </div>
      </section>

      {/* Executable AI Intelligence */}
      <section className="border-b border-line bg-[#0c141b] py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="max-w-3xl">
            <p className="eyebrow">Deterministic Execution</p>
            <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white">
              AI intelligence becomes executable.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Sisera AI is connected to the portfolio, risk engine, order system, market data,
              execution layer, and agent runtime. A trader moves naturally from natural language
              inquiry to an executable trading policy.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            <div className="rounded border border-line bg-panel p-5">
              <span className="font-mono text-xs text-cyan-300">01 · Inquiry</span>
              <p className="mt-2 text-sm font-semibold text-white">
                “Why is OpenAI trading 8% above its mark?”
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Sisera analyzes secondary market volume, recent funding rounds, and liquidity depth.
              </p>
            </div>

            <div className="rounded border border-line bg-panel p-5">
              <span className="font-mono text-xs text-cyan-300">02 · Thesis</span>
              <p className="mt-2 text-sm font-semibold text-white">
                “Show me the strongest argument for and against buying it.”
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Synthesizes institutional bull and bear arguments with verified source evidence.
              </p>
            </div>

            <div className="rounded border border-line bg-panel p-5">
              <span className="font-mono text-xs text-cyan-300">03 · Simulation</span>
              <p className="mt-2 text-sm font-semibold text-white">
                “What happens if I allocate $5,000?”
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Calculates portfolio concentration, margin impact, and volatility shifts.
              </p>
            </div>

            <div className="rounded border border-line bg-[#111e29] p-5">
              <span className="font-mono text-xs text-cyan-300">04 · Execution Policy</span>
              <p className="mt-2 text-sm font-semibold text-cyan-100">
                “Buy $2,000 if the premium falls below 3%, liquidity remains above my threshold, and
                no high-severity negative event appears.”
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Compiled into a declarative order policy with strict invalidation rules and limits.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded border border-line bg-panel p-5">
            <p className="text-xs font-semibold text-white">
              Deterministic Risk Separation: No Blind Signing
            </p>
            <p className="mt-1 text-xs leading-6 text-slate-300">
              Sisera converts instructions into structured trading policies rather than allowing a
              language model to directly touch capital. Deterministic risk controls validate the
              plan before any order can reach Solana.
            </p>
          </div>
        </div>
      </section>

      {/* Autonomous Agents */}
      <section className="border-b border-line bg-[#0e161d] py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div>
              <p className="eyebrow">Persistent Automation</p>
              <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white">
                Any strategy can become a persistent trading agent.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-300">
                Agents can monitor markets around the clock, consume the same technical, valuation,
                news, macro, Pyth, PreStocks, liquidity, and portfolio intelligence available to a
                human trader, and act when predefined conditions are met.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Users define how much capital an agent controls, which assets it may trade, its
                maximum position size, drawdown limit, allowed venues, and whether actions are
                automatic or require confirmation.
              </p>

              <div className="mt-6 space-y-3">
                <div className="rounded border border-line bg-panel p-4">
                  <h4 className="text-xs font-semibold text-white">Auditable Decision Trail</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Every action is attributable to the market state, news events, valuation data,
                    strategy version, risk state, and execution policy that produced it.
                  </p>
                </div>
                <div className="rounded border border-line bg-panel p-4">
                  <h4 className="text-xs font-semibold text-white">Automated Circuit Breakers</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Agents are automatically paused if daily drawdown exceeds configured limits or
                    market conditions dislocate beyond safety thresholds.
                  </p>
                </div>
              </div>
            </div>

            {/* Autonomy Tiers */}
            <div className="rounded border border-line bg-panel p-5">
              <h3 className="text-sm font-semibold text-white">Autonomy Levels</h3>
              <div className="mt-4 space-y-2.5">
                {[
                  {
                    level: "L0",
                    title: "Research",
                    desc: "Read-only market data and quantitative analysis. Cannot propose trades.",
                  },
                  {
                    level: "L1",
                    title: "Suggest",
                    desc: "Generates recommendations with full rationale. Operator must create order.",
                  },
                  {
                    level: "L2",
                    title: "Confirm",
                    desc: "Compiles structured orders; requires one-tap operator confirmation.",
                  },
                  {
                    level: "L3",
                    title: "Policy Auto",
                    desc: "Executes orders that strictly satisfy a declarative policy. Manual pause override.",
                  },
                  {
                    level: "L4",
                    title: "Autonomous",
                    desc: "High-frequency or multi-leg execution within explicit risk boundaries.",
                  },
                ].map((tier) => (
                  <div
                    key={tier.level}
                    className="rounded border border-line/60 bg-[#101b23] p-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-300">
                        {tier.level}
                      </span>
                      <span className="font-semibold text-white">{tier.title}</span>
                    </div>
                    <p className="mt-1 text-slate-400 leading-5">{tier.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clawpump & Meteora DBC */}
      <section className="border-b border-line bg-ink py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="max-w-3xl">
            <p className="eyebrow">Agent Markets & Liquidity</p>
            <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white">
              Clawpump agent markets with Meteora stock-aware liquidity.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Existing Clawpump assets are discoverable and tradable directly inside Sisera, while
              Meteora Dynamic Bonding Curves provide stock-aware market formation and liquidity.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded border border-line bg-panel p-5">
              <h3 className="text-base font-semibold text-white">
                Clawpump: Agent Market & Launch Infrastructure
              </h3>
              <p className="mt-3 text-xs leading-6 text-slate-300">
                Discover and trade Clawpump assets with live pricing, liquidity, holder data,
                related stock exposure, and news context. Users can also turn a Sisera trading agent
                into an onchain Clawpump asset with a stock-paired liquidity market.
              </p>
              <Link
                href="/clawpump"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                Explore Clawpump markets <ArrowUpRight size={13} />
              </Link>
            </div>

            <div className="rounded border border-line bg-panel p-5">
              <h3 className="text-base font-semibold text-white">
                Meteora DBC: Stock-Aware Launch Infrastructure
              </h3>
              <p className="mt-3 text-xs leading-6 text-slate-300">
                Instead of applying generic memecoin curves, Sisera provides Meteora Dynamic Bonding
                Curve configurations designed around assets with external reference values and
                explicit price-discovery requirements, with seamless graduation into deep Meteora
                liquidity pools.
              </p>
              <p className="mt-4 font-mono text-[11px] text-slate-500">
                Programmable curves · Reference-value divergence tracking · Fee optimization
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Unified Portfolio */}
      <section className="border-b border-line bg-[#0e161d] py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <p className="eyebrow">Unified Ledger</p>
              <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white">
                One portfolio across human and autonomous markets.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-300">
                Every trade ultimately flows back into one Sisera portfolio. Users can see tokenized
                public equities, PreStocks positions, Clawpump assets, agent allocations, cash, and
                Solana assets together instead of managing them as separate applications.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Sisera calculates realized and unrealized PnL, concentration, asset and sector
                exposure, liquidity risk, valuation divergence, and agent exposure at the portfolio
                level.
              </p>

              <div className="mt-6 rounded border border-line bg-panel p-4">
                <p className="text-xs font-semibold text-white">
                  Portfolio-in-the-Loop Intelligence
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Sisera flags when an attractive opportunity would make the portfolio excessively
                  concentrated, duplicate an existing exposure, or consume too much liquidity.
                </p>
              </div>
            </div>

            <div className="rounded border border-line bg-panel p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-xs font-semibold text-white">Portfolio Allocation</span>
                <span className="font-mono text-xs text-slate-400">Total: $100,000.00</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  {
                    name: "OpenAI Token (PreStocks)",
                    type: "Private Market",
                    alloc: "24.5%",
                    val: "$24,500.00",
                  },
                  {
                    name: "AAPL Token (xStock)",
                    type: "Public Equity",
                    alloc: "32.0%",
                    val: "$32,000.00",
                  },
                  {
                    name: "SpaceX Token (PreStocks)",
                    type: "Private Market",
                    alloc: "18.5%",
                    val: "$18,500.00",
                  },
                  {
                    name: "BTC Trend Follower v2",
                    type: "Autonomous Agent",
                    alloc: "15.0%",
                    val: "$15,000.00",
                  },
                  {
                    name: "USDC / Cash Reserves",
                    type: "Settlement",
                    alloc: "10.0%",
                    val: "$10,000.00",
                  },
                ].map((row) => (
                  <div
                    key={row.name}
                    className="flex justify-between rounded border border-line/60 bg-[#101b23] p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-200">{row.name}</p>
                      <p className="font-mono text-[10px] text-slate-500">{row.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-white">{row.val}</p>
                      <p className="font-mono text-[10px] text-slate-400">{row.alloc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Sisera Belongs on Solana: The Workflow */}
      <section className="border-b border-line bg-ink py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="max-w-3xl">
            <p className="eyebrow">Composable Architecture</p>
            <h2 className="mt-4 text-[clamp(2rem,3.4vw,3.4rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white">
              Why Sisera belongs on Solana.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Tokenized markets become much more useful when the stock, liquidity, wallet, trading
              agent, and financial applications surrounding them interact on the same network.
            </p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "01",
                title: "Discover Asset",
                desc: "Public stocks, PreStocks, or agent markets.",
              },
              {
                step: "02",
                title: "Fair Value",
                desc: "Compare against Pyth benchmarks and marks.",
              },
              {
                step: "03",
                title: "News & Events",
                desc: "Classified by source, severity, and relevance.",
              },
              {
                step: "04",
                title: "AI Analysis",
                desc: "Synthesizes thesis and portfolio exposure.",
              },
              {
                step: "05",
                title: "Risk Simulation",
                desc: "Pre-trade concentration and liquidity checks.",
              },
              {
                step: "06",
                title: "Onchain Trade",
                desc: "Routed via Jupiter with wallet signing.",
              },
              {
                step: "07",
                title: "Deploy Agent",
                desc: "Persistent execution within explicit limits.",
              },
              {
                step: "08",
                title: "Market Liquidity",
                desc: "Stock-paired Meteora Dynamic Bonding Curves.",
              },
            ].map((s) => (
              <div key={s.step} className="rounded border border-line bg-panel p-4">
                <span className="font-mono text-xs font-bold text-cyan-300">{s.step}</span>
                <h3 className="mt-1 text-sm font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-xs text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mobile Trading */}
      <section className="border-b border-line bg-[#0e161d] py-16 md:py-24">
        <div className="mx-auto max-w-[1560px] px-5 md:px-10">
          <div className="rounded border border-line bg-panel p-8 md:p-12 lg:flex lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-mono uppercase text-cyan-300">
                <Smartphone size={14} />
                <span>Mobile Trading Application</span>
              </div>
              <h2 className="mt-3 text-2xl font-medium text-white md:text-3xl">
                Solana Mobile, Android, and iOS.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Sisera is available as a professional web terminal and as a mobile trading
                application for Solana Mobile, Android, and iOS, so positions, agents, alerts,
                approvals, and market intelligence remain accessible away from the desktop.
              </p>
            </div>
            <div className="mt-6 lg:mt-0">
              <Button
                asChild
                variant="primary"
                size="lg"
                className="rounded border border-cyan-300 bg-cyan-300 text-xs font-semibold text-[#14202a] hover:bg-cyan-200"
              >
                <Link href="/stocks">Launch Terminal</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Clean Footer */}
      <footer className="mx-auto max-w-[1560px] px-5 py-12 text-xs text-slate-400 md:px-10">
        <div className="flex flex-col justify-between gap-6 border-b border-line pb-8 md:flex-row md:items-center">
          <div className="flex items-center gap-2.5">
            <SiseraMark size={28} />
            <span className="text-sm font-semibold tracking-[0.14em] text-white">SISERA</span>
          </div>

          <div className="flex flex-wrap gap-6 text-xs text-slate-400">
            <Link href="/stocks" className="hover:text-white">
              Stocks
            </Link>
            <Link href="/private-markets" className="hover:text-white">
              PreStocks
            </Link>
            <Link href="/clawpump" className="hover:text-white">
              Agent Markets
            </Link>
            <Link href="/intelligence" className="hover:text-white">
              Intelligence
            </Link>
            <Link href="/portfolio" className="hover:text-white">
              Portfolio
            </Link>
            <Link href="/risk" className="hover:text-white">
              Risk Engine
            </Link>
            <Link href="/agents" className="hover:text-white">
              Agents
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col justify-between gap-3 text-[11px] text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Sisera. Full-stack trading terminal on Solana.</p>
          <p>Markets carry risk. Research reference values and review each trade before signing.</p>
        </div>
      </footer>
    </main>
  );
}
