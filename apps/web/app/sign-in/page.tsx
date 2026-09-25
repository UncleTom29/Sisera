import { Button, StatusBadge } from "@sisera/ui";
import { ArrowLeft, ArrowRight, Check, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { isOidcConfigured, signIn } from "../../auth";
import { SiseraMark } from "../../components/operator-shell";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-[#080c12] lg:grid-cols-[1.05fr_.95fr]">
      <section className="technical-grid relative hidden overflow-hidden border-r border-line p-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="relative z-10 flex items-center gap-3">
          <SiseraMark />
          <span className="text-sm font-semibold tracking-[.2em]">SISERA</span>
        </Link>
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow">One governed operating surface</p>
          <h1 className="mt-6 text-6xl font-medium leading-[.95] tracking-[-.06em] text-white">
            Your edge moves fast.
            <br />
            <span className="text-cyan-300">Your controls move first.</span>
          </h1>
          <p className="mt-7 max-w-lg text-sm leading-7 text-slate-400">
            Research, route, automate, and supervise risk without surrendering deterministic control
            of execution.
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-3 border-y border-line">
            {["Source-labelled data", "Policy-gated orders", "Auditable automation"].map((item) => (
              <div key={item} className="border-r border-line px-3 py-4 last:border-r-0">
                <Check size={13} className="text-emerald-300" />
                <p className="mt-3 text-[10px] leading-4 text-slate-400">{item}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 font-mono text-[9px] uppercase tracking-[.16em] text-slate-700">
          Institutional workspace · Paper first · Human governed
        </p>
        <div className="absolute -bottom-40 -right-24 size-[620px] rounded-full bg-cyan-400/[0.07] blur-3xl" />
      </section>
      <section className="flex min-h-screen flex-col bg-[#090d13]">
        <div className="flex h-16 items-center justify-between border-b border-line px-6 lg:px-10">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-white"
          >
            <ArrowLeft size={14} /> Back to site
          </Link>
          <StatusBadge tone="info">Secure access</StatusBadge>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-16">
          <div className="w-full max-w-lg">
            <div className="grid size-11 place-items-center border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <KeyRound size={19} />
            </div>
            <p className="mt-8 eyebrow">Back to your edge</p>
            <h2 className="mt-4 text-4xl font-medium tracking-[-.045em] text-white">
              Operator sign in
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">
              Continue with your organization identity provider. Authentication, portfolio access,
              and execution permission remain separate controls.
            </p>
            {isOidcConfigured ? (
              <form
                action={async () => {
                  "use server";
                  await signIn("keycloak", { redirectTo: "/terminal" });
                }}
                className="mt-10"
              >
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full justify-between px-5"
                >
                  Continue with organization SSO <ArrowRight size={15} />
                </Button>
              </form>
            ) : (
              <div className="mt-10 border border-amber-500/25 bg-amber-500/[0.07] p-4">
                <p className="text-xs font-semibold text-amber-200">
                  Identity provider not configured
                </p>
                <p className="mt-2 text-[11px] leading-5 text-amber-100/60">
                  Configure the Keycloak OIDC variables. Local operator mode may be used only for
                  interface development.
                </p>
              </div>
            )}
            <div className="mt-8 flex items-start gap-3 border-t border-line pt-5 text-[10px] leading-5 text-slate-600">
              <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={14} />
              <p>
                Sisera does not treat wallet possession as permission to trade. Every sensitive
                action is identity-bound, policy-checked, and recorded.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
