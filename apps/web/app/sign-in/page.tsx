import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { SiseraMark } from "../../components/operator-shell";
import { PrivySignIn } from "../../components/privy-sign-in";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-[#080c12] lg:grid-cols-[1.05fr_.95fr]">
      <section className="technical-grid relative hidden overflow-hidden border-r border-line p-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="relative z-10 flex items-center gap-3">
          <SiseraMark />
          <span className="text-sm font-semibold tracking-[.2em]">SISERA</span>
        </Link>
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow">Solana Financial Terminal</p>
          <h1 className="mt-6 text-5xl font-medium leading-[1.02] tracking-[-.05em] text-white">
            Tokenized equities, private markets, and
            <br />
            <span className="text-cyan-300">autonomous agents.</span>
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-slate-300">
            One unified terminal to discover markets, measure fair-value divergence against Pyth,
            trade PreStocks private assets, and deploy persistent trading agents within explicit
            risk limits.
          </p>
        </div>
        <p className="relative z-10 font-mono text-[9px] uppercase tracking-[.16em] text-slate-500">
          Professional Web Terminal & Mobile Trading
        </p>
      </section>
      <section className="flex min-h-screen flex-col bg-[#090d13]">
        <div className="flex h-16 items-center justify-between border-b border-line px-6 lg:px-10">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-white"
          >
            <ArrowLeft size={14} /> Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-16">
          <div className="w-full max-w-lg">
            <div className="grid size-11 place-items-center border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <KeyRound size={19} />
            </div>
            <p className="mt-8 eyebrow">Terminal Access</p>
            <h2 className="mt-4 text-4xl font-medium tracking-[-.045em] text-white">
              Sign in to Sisera
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
              Access your unified portfolio, autonomous agent controls, and real-time market
              intelligence.
            </p>
            {process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
              <PrivySignIn />
            ) : (
              <div className="mt-10 border border-amber-500/25 bg-amber-500/[0.07] p-4">
                <p className="text-xs font-semibold text-amber-200">
                  Sign-in is temporarily unavailable
                </p>
                <p className="mt-2 text-[11px] leading-5 text-amber-100/60">
                  Please try again shortly.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
