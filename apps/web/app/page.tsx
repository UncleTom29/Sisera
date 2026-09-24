import { Button, StatusBadge } from "@sisera/ui";
import {
  ArrowRight,
  Braces,
  ChartNoAxesCombined,
  LockKeyhole,
  Network,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

const capabilities = [
  {
    code: "01",
    title: "One instrument model",
    copy: "Spot, perps, options, tokenized assets, FX, commodities, indices, and outcome contracts share one normalized risk vocabulary.",
  },
  {
    code: "02",
    title: "Risk is in the execution path",
    copy: "Every manual, API, copilot, and agent-originated order passes the same deterministic pre-trade policy gate.",
  },
  {
    code: "03",
    title: "Intelligence with provenance",
    copy: "Research can be probabilistic. Execution cannot. Sisera compiles intent into reviewable drafts and records every decision input.",
  },
];

const assetClasses = [
  "Crypto spot",
  "Perpetuals",
  "Options",
  "Tokenized equities",
  "FX",
  "Commodities",
  "Indices",
  "Prediction markets",
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-ink">
      <header className="relative z-20 border-b border-line bg-ink/95">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-10">
          <Link href="/" className="flex items-center gap-3" aria-label="Sisera home">
            <LogoMark />
            <span className="text-sm font-semibold tracking-[0.22em]">SISERA</span>
          </Link>
          <nav className="hidden items-center gap-8 text-[12px] text-slate-400 md:flex">
            <a href="#system" className="hover:text-white">
              System
            </a>
            <a href="#controls" className="hover:text-white">
              Controls
            </a>
            <a href="#architecture" className="hover:text-white">
              Architecture
            </a>
            <Link href="/sign-in" className="hover:text-white">
              Operator sign in
            </Link>
          </nav>
          <Button asChild variant="primary" size="sm">
            <Link href="/terminal">
              Open terminal <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      </header>

      <section className="technical-grid relative border-b border-line">
        <div className="mx-auto grid max-w-[1440px] lg:min-h-[720px] lg:grid-cols-[1.05fr_.95fr]">
          <div className="flex flex-col justify-between border-line px-5 py-20 lg:border-r lg:px-10 lg:py-28">
            <div>
              <div className="mb-8 flex items-center gap-3">
                <span className="h-px w-8 bg-cyan-300" />
                <p className="eyebrow">Institutional multi-asset operating system</p>
              </div>
              <h1 className="max-w-4xl text-[clamp(3.6rem,7vw,7.6rem)] font-medium leading-[0.86] tracking-[-0.075em] text-slate-50">
                Markets move.
                <br />
                Risk stays governed.
              </h1>
              <p className="mt-10 max-w-xl text-base leading-7 text-slate-400">
                Research, execute, automate, and supervise portfolios across venues from one
                exacting control plane.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button asChild variant="primary" size="lg">
                  <Link href="/terminal">
                    Launch workspace <ArrowRight size={15} />
                  </Link>
                </Button>
                <Button asChild size="lg">
                  <a href="#architecture">View architecture</a>
                </Button>
              </div>
            </div>
            <div className="mt-20 grid grid-cols-3 border-y border-line text-xs lg:max-w-2xl">
              <Metric label="Execution" value="Policy-gated" />
              <Metric label="Market data" value="Source-labelled" />
              <Metric label="Automation" value="Human-governed" />
            </div>
          </div>

          <div className="relative flex items-center px-5 py-16 lg:px-10">
            <TerminalPreview />
          </div>
        </div>
      </section>

      <section id="system" className="border-b border-line">
        <div className="mx-auto max-w-[1440px] px-5 py-24 lg:px-10 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]">
            <div>
              <p className="eyebrow">The system</p>
              <h2 className="mt-5 max-w-md text-4xl font-medium tracking-[-0.045em] text-white">
                Built around decisions, not dashboards.
              </h2>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {capabilities.map((item) => (
                <article
                  key={item.code}
                  className="grid gap-4 py-8 sm:grid-cols-[56px_220px_1fr] sm:gap-8"
                >
                  <span className="data-value text-xs text-cyan-300">{item.code}</span>
                  <h3 className="font-semibold text-slate-100">{item.title}</h3>
                  <p className="max-w-2xl text-sm leading-6 text-slate-400">{item.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="controls" className="border-b border-line bg-[#070b11]">
        <div className="mx-auto max-w-[1440px] px-5 py-24 lg:px-10 lg:py-32">
          <p className="eyebrow">Operating controls</p>
          <div className="mt-8 grid border-l border-t border-line md:grid-cols-2 xl:grid-cols-4">
            <Feature
              icon={ChartNoAxesCombined}
              title="Portfolio truth"
              copy="Normalized positions, cash, P&L, margin, and exposure with explicit freshness."
            />
            <Feature
              icon={ShieldCheck}
              title="Pre-trade policy"
              copy="Notional, concentration, loss, leverage, and mandate checks run before routing."
            />
            <Feature
              icon={Network}
              title="Venue abstraction"
              copy="Adapters isolate exchange quirks without leaking them into portfolio logic."
            />
            <Feature
              icon={LockKeyhole}
              title="Agent governance"
              copy="Promotion stages, capital caps, kill switches, and immutable proposal history."
            />
          </div>
        </div>
      </section>

      <section id="architecture" className="border-b border-line">
        <div className="mx-auto grid max-w-[1440px] gap-16 px-5 py-24 lg:grid-cols-[.85fr_1.15fr] lg:px-10 lg:py-32">
          <div>
            <p className="eyebrow">Architecture</p>
            <h2 className="mt-5 text-4xl font-medium tracking-[-0.045em] text-white">
              A control plane designed to fail closed.
            </h2>
            <p className="mt-6 max-w-lg text-sm leading-7 text-slate-400">
              When a quote is stale, a mandate is unavailable, or identity cannot be verified, the
              execution path stops. No silent fallback. No invented market state.
            </p>
            <div className="mt-9 flex flex-wrap gap-2">
              {assetClasses.map((asset) => (
                <StatusBadge key={asset}>{asset}</StatusBadge>
              ))}
            </div>
          </div>
          <SystemMap />
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-12 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="tracking-[0.18em] text-slate-300">SISERA</span>
        </div>
        <p>
          Trading systems carry material risk. Start with paper execution and independent review.
        </p>
      </footer>
    </main>
  );
}

function LogoMark() {
  return (
    <span className="grid size-7 place-items-center border border-cyan-300/60 bg-cyan-300/10 font-mono text-[10px] font-bold text-cyan-200">
      S
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-line px-4 py-4 last:border-r-0">
      <p className="data-label">{label}</p>
      <p className="mt-2 text-[12px] font-semibold text-slate-200">{value}</p>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  copy,
}: { icon: typeof Braces; title: string; copy: string }) {
  return (
    <article className="min-h-64 border-b border-r border-line p-7">
      <Icon className="text-cyan-300" size={20} strokeWidth={1.5} />
      <h3 className="mt-16 font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-400">{copy}</p>
    </article>
  );
}

function TerminalPreview() {
  return (
    <div className="relative w-full border border-line-strong bg-[#070b10] shadow-2xl shadow-black/40">
      <div className="flex h-10 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="font-mono text-[10px] tracking-widest text-slate-400">
            OPERATOR / GLOBAL
          </span>
        </div>
        <StatusBadge tone="warning">No venue connected</StatusBadge>
      </div>
      <div className="grid min-h-[440px] grid-cols-[84px_1fr]">
        <div className="border-r border-line p-2">
          {["OV", "MK", "TR", "PF", "RK", "AG"].map((item, index) => (
            <div
              key={item}
              className={`mb-1 px-3 py-2 font-mono text-[10px] ${index === 0 ? "bg-slate-800 text-cyan-200" : "text-slate-600"}`}
            >
              {item}
            </div>
          ))}
        </div>
        <div>
          <div className="grid grid-cols-3 border-b border-line">
            {["NET ASSET VALUE", "GROSS EXPOSURE", "TODAY P&L"].map((label) => (
              <div key={label} className="border-r border-line p-4 last:border-r-0">
                <p className="data-label">{label}</p>
                <p className="data-value mt-3 text-xl text-slate-500">—</p>
              </div>
            ))}
          </div>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold">Market monitor</span>
              <span className="data-label">Source / status / latency</span>
            </div>
            <div className="grid h-44 place-items-center border border-dashed border-slate-800">
              <div className="text-center">
                <Braces className="mx-auto text-slate-700" size={22} />
                <p className="mt-3 text-xs text-slate-500">Connect an approved data provider</p>
                <p className="mt-1 font-mono text-[10px] text-slate-700">
                  No synthetic fallback enabled
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 border-t border-line">
            <div className="p-4">
              <p className="data-label">Risk engine</p>
              <p className="mt-3 text-xs text-emerald-300">Ready / fail-closed</p>
            </div>
            <div className="border-l border-line p-4">
              <p className="data-label">Decision ledger</p>
              <p className="mt-3 text-xs text-slate-400">Append-only provenance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemMap() {
  const rows = [
    ["INPUT", "Market data · orders · intents"],
    ["NORMALIZE", "Instrument master · portfolio truth"],
    ["CONTROL", "RBAC · policy · pre-trade risk"],
    ["EXECUTE", "Paper engine · venue adapters"],
    ["PROVE", "Decision ledger · metrics · audit"],
  ];
  return (
    <div className="border border-line bg-panel">
      {rows.map(([label, value], index) => (
        <div
          key={label}
          className="grid grid-cols-[110px_1fr] border-b border-line last:border-b-0"
        >
          <div className="border-r border-line p-5 font-mono text-[10px] text-cyan-300">
            {String(index + 1).padStart(2, "0")} / {label}
          </div>
          <div className="p-5 text-sm text-slate-300">{value}</div>
        </div>
      ))}
    </div>
  );
}
