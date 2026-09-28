import Link from "next/link";
import { SiseraMark } from "../components/sisera-mark";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="technical-grid grid min-h-screen place-items-center bg-ink-deep px-5">
      <div className="w-full max-w-lg border border-line bg-ink p-8">
        <SiseraMark size={36} />
        <p className="eyebrow mt-8">404 · No such market</p>
        <h1 className="display mt-3 text-4xl text-bone">This page isn't listed.</h1>
        <p className="mt-4 text-sm leading-7 text-slate-400">
          The symbol or page may have been delisted, renamed, or never existed. Search the terminal
          or start from the markets overview.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/stocks"
            className="bg-bronze-300 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-bronze-200"
          >
            Open markets
          </Link>
          <Link
            href="/"
            className="border border-line-strong px-4 py-2.5 text-sm text-bone hover:border-bone"
          >
            Back to sisera.xyz
          </Link>
        </div>
      </div>
    </main>
  );
}
