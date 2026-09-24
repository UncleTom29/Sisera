import { Button, StatusBadge } from "@sisera/ui";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { isOidcConfigured, signIn } from "../../auth";

export default function SignInPage() {
  return (
    <main className="technical-grid grid min-h-screen place-items-center px-5 py-16">
      <div className="w-full max-w-md border border-line-strong bg-panel">
        <div className="flex items-center justify-between border-b border-line p-5">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft size={14} /> Home
          </Link>
          <StatusBadge tone="info">Secure access</StatusBadge>
        </div>
        <div className="p-8">
          <div className="grid size-11 place-items-center border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
            <KeyRound size={19} />
          </div>
          <h1 className="mt-7 text-3xl font-medium tracking-[-0.04em]">Operator sign in</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Access is delegated to your organization identity provider. Roles and execution
            permissions are evaluated independently.
          </p>
          {isOidcConfigured ? (
            <form
              action={async () => {
                "use server";
                await signIn("keycloak", { redirectTo: "/terminal" });
              }}
              className="mt-8"
            >
              <Button type="submit" variant="primary" size="lg" className="w-full">
                Continue with organization SSO
              </Button>
            </form>
          ) : (
            <div className="mt-8 border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs font-semibold text-amber-200">
                Identity provider not configured
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-100/60">
                Set the AUTH_KEYCLOAK variables or enable local operator mode only for interface
                development.
              </p>
            </div>
          )}
        </div>
        <div className="flex items-start gap-3 border-t border-line p-5 text-[11px] leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 shrink-0" size={15} />
          <p>
            Sisera does not use wallet possession as authorization to trade. Wallet signatures and
            operator permissions are separate controls.
          </p>
        </div>
      </div>
    </main>
  );
}
