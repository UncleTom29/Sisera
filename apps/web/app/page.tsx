import { Button } from "@sisera/ui";
import { ArrowRight, ArrowUpRight, ChartCandlestick, ShieldCheck, Waypoints } from "lucide-react";
import Link from "next/link";
import { SiseraMark } from "../components/sisera-mark";

const capabilities = [
  {
    number: "01",
    icon: ChartCandlestick,
    title: "See the market as it is",
    description:
      "Live spot prices, candles, and order book depth. Source and update times stay attached to every market view.",
  },
  {
    number: "02",
    icon: Waypoints,
    title: "Move from signal to context",
    description:
      "Inspect market structure and quantitative signals in one workspace before drafting a trade.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "Keep control of execution",
    description:
      "Paper order intent and pre-trade checks keep account state, risk limits, and operator review in the path.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <header className="border-b border-line bg-[#101b23]">
        <div className="mx-auto flex h-[76px] max-w-[1560px] items-center justify-between px-5 md:px-10">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Sisera home">
            <SiseraMark size={36} />
            <span className="text-[17px] font-semibold tracking-[0.13em]">SISERA</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
            <a href="#platform" className="transition-colors hover:text-white">
              Platform
            </a>
            <a href="#approach" className="transition-colors hover:text-white">
              Approach
            </a>
            <Link href="/sign-in" className="transition-colors hover:text-white">
              Sign in
            </Link>
          </nav>
          <Button
            asChild
            variant="primary"
            className="rounded-md border-cyan-300 bg-cyan-300 text-[#14202a] hover:bg-cyan-200"
          >
            <Link href="/terminal">
              Open workspace <ArrowUpRight size={16} />
            </Link>
          </Button>
        </div>
      </header>

      <section className="relative isolate min-h-[680px] overflow-hidden border-b border-line">
        <div className="absolute inset-0 bg-[url('/brand/sisera-signal.png')] bg-cover bg-[65%_center] opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c141b] via-[#0c141b]/95 to-[#0c141b]/20" />
        <div className="relative mx-auto flex min-h-[680px] max-w-[1560px] flex-col justify-center px-5 py-20 md:px-10">
          <div className="flex items-center gap-3">
            <span className="h-px w-9 bg-cyan-300" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-300">
              A better view of the market
            </span>
          </div>
          <h1 className="mt-9 max-w-[880px] text-[clamp(3.4rem,7vw,7rem)] font-medium leading-[0.98] tracking-[-0.07em] text-[#f4f0e9]">
            The market at hand.
            <br />
            <span className="text-[#e9bd8c]">The risk in view.</span>
          </h1>
          <p className="mt-8 max-w-[560px] text-lg leading-8 text-[#aab8bd]">
            Sisera brings live markets, research, and guarded execution into a trading workspace
            made for deliberate decisions.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button
              asChild
              variant="primary"
              size="lg"
              className="rounded-md border-cyan-300 bg-cyan-300 text-[#14202a] hover:bg-cyan-200"
            >
              <Link href="/terminal">
                Enter the terminal <ArrowRight size={16} />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="rounded-md border-slate-500 bg-transparent text-slate-100 hover:bg-white/10"
            >
              <a href="#platform">Explore the platform</a>
            </Button>
          </div>
          <div className="mt-16 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-5 font-mono text-[11px] uppercase tracking-wide text-slate-400">
            <span>Live spot feed</span>
            <span>Verified data provenance</span>
            <span>Paper execution controls</span>
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-[1560px] px-5 py-24 md:px-10 md:py-32">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <p className="eyebrow">One working surface</p>
            <h2 className="mt-5 max-w-[520px] text-[clamp(2.6rem,4vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.055em]">
              Follow the market. Keep your judgment.
            </h2>
          </div>
          <div className="border-t border-line">
            {capabilities.map((capability) => (
              <article
                key={capability.number}
                className="grid gap-4 border-b border-line py-7 sm:grid-cols-[54px_1fr]"
              >
                <span className="font-mono text-xs text-cyan-300">{capability.number}</span>
                <div>
                  <div className="flex items-center gap-3">
                    <capability.icon size={19} className="text-cyan-300" strokeWidth={1.6} />
                    <h3 className="text-lg font-medium text-slate-100">{capability.title}</h3>
                  </div>
                  <p className="mt-3 max-w-[580px] text-sm leading-7 text-slate-400">
                    {capability.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="approach" className="border-y border-line bg-[#14202a]">
        <div className="mx-auto grid max-w-[1560px] gap-12 px-5 py-20 md:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div>
            <p className="eyebrow">Operating principle</p>
            <h2 className="mt-5 max-w-[700px] text-[clamp(2.4rem,4vw,4.2rem)] font-medium leading-[1.08] tracking-[-0.05em]">
              Every number has a source. Every order has a gate.
            </h2>
          </div>
          <div className="flex flex-col justify-between border-l border-line pl-8">
            <p className="max-w-[480px] text-base leading-8 text-slate-400">
              The current workspace covers public crypto spot data and prediction market discovery.
              Trading remains paper only until portfolio reconciliation and risk policy are
              connected.
            </p>
            <Link
              href="/markets"
              className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-cyan-300 hover:text-cyan-200"
            >
              Explore live markets <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-6 px-5 py-10 text-xs text-slate-500 md:px-10">
        <div className="flex items-center gap-2">
          <SiseraMark size={28} />
          <span className="font-semibold tracking-[0.12em] text-slate-200">SISERA</span>
        </div>
        <p>Markets carry risk. Research the data and review each decision.</p>
      </footer>
    </main>
  );
}
