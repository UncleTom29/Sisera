"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Assessment = {
  summary: string;
  opportunities: string[];
  risks: string[];
  confidence: number;
  actionability: "research_only";
  evidence: {
    marketSource: string;
    marketObservedAt: string;
    tokenPrice: string | null;
    referencePrice: string | null;
    referenceKind: "prestocks_mark" | "pyth_core_equity" | "public_equity" | "unavailable";
    referenceFreshness: "live" | "carried_forward" | "stale" | "unavailable";
    referenceObservedAt: string | null;
    liquidityUsd: number | null;
    articles: Array<{ title: string; publishedAt: string; publisher: string; url: string }>;
  };
};

export function StockAssessment({
  symbol,
  signedIn = true,
}: { symbol: string; signedIn?: boolean }) {
  const pathname = usePathname();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stock-assessment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (response.status === 401) throw new Error("Sign in to run market research.");
      if (response.status === 429)
        throw new Error("You have run several assessments in a row. Try again in a minute.");
      if (!response.ok) throw new Error("The assessment could not be completed. Try again.");
      const payload = (await response.json()) as { data: Assessment };
      setAssessment(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assessment unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border border-line bg-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Market Research</p>
          <h2 className="mt-1 text-sm font-semibold text-bone">Company and market assessment</h2>
        </div>
        {!signedIn ? (
          <Link
            href={`/sign-in?returnTo=${encodeURIComponent(pathname)}`}
            className="inline-flex items-center gap-2 border border-line bg-ink-raised px-3 py-2 text-xs font-medium text-slate-200 hover:border-bronze-300"
          >
            <FileText size={13} className="text-bronze-300" /> Sign in to run research
          </Link>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={run}
            className="inline-flex items-center gap-2 rounded border border-line bg-ink-raised px-3 py-2 text-xs font-medium text-slate-200 hover:border-bronze-300 hover:text-white disabled:opacity-50"
          >
            <FileText size={13} className="text-bronze-300" />
            {loading ? "Analyzing…" : "Run assessment"}
          </button>
        )}
      </div>
      {assessment ? (
        <div className="mt-5 space-y-4 text-xs leading-6 text-slate-300">
          <p>{assessment.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-[var(--up)]">Potential catalysts</p>
              <ul className="mt-2 list-inside list-disc">
                {assessment.opportunities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-[var(--down)]">Key risks</p>
              <ul className="mt-2 list-inside list-disc">
                {assessment.risks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <p className="font-mono text-[10px] text-slate-400">
              Research confidence {(assessment.confidence * 100).toFixed(0)}% · Updated{" "}
              {new Date(assessment.evidence.marketObservedAt).toLocaleString()}
            </p>
            <div className="mt-3 grid gap-px bg-line sm:grid-cols-3">
              {[
                [
                  "Token price",
                  assessment.evidence.tokenPrice ?? "Price pending",
                  "Latest market reading",
                ],
                [
                  "Share price",
                  assessment.evidence.referencePrice ?? "Price pending",
                  assessment.evidence.referenceFreshness === "live"
                    ? "Current session"
                    : "Latest available",
                ],
                [
                  "Liquidity",
                  assessment.evidence.liquidityUsd == null
                    ? "Market data pending"
                    : `$${assessment.evidence.liquidityUsd.toLocaleString()}`,
                  "Available market liquidity",
                ],
              ].map(([label, value, source]) => (
                <div key={label} className="bg-ink p-3">
                  <p className="data-label">{label}</p>
                  <p className="mt-1 font-mono text-xs text-slate-200">{value}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{source}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              This research uses recent headlines and market activity. Review the underlying news
              before trading.
            </p>
            {assessment.evidence.referenceObservedAt && (
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                Share price updated{" "}
                {new Date(assessment.evidence.referenceObservedAt).toLocaleString()}
              </p>
            )}
            {assessment.evidence.articles.length ? (
              <ul className="mt-3 space-y-2">
                {assessment.evidence.articles.map((article) => (
                  <li key={article.url}>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bronze-300 hover:text-white"
                    >
                      {article.title}
                    </a>
                    <span className="ml-2 text-[10px] text-slate-500">
                      {article.publisher} · {new Date(article.publishedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-amber-300">
                Explore the company profile and market activity while fresh news arrives.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Get a concise view of catalysts, risks, price differences and recent headlines.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-amber-300">
          {error}
        </p>
      )}
    </section>
  );
}
