"use client";

import { FileText } from "lucide-react";
import { useState } from "react";

type Assessment = {
  summary: string;
  opportunities: string[];
  risks: string[];
  confidence: number;
  actionability: "research_only";
};

export function StockAssessment({ symbol }: { symbol: string }) {
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
      if (!response.ok)
        throw new Error(
          response.status === 503
            ? "Market research is temporarily unavailable."
            : "Assessment could not be completed.",
        );
      const payload = (await response.json()) as { data: Assessment };
      setAssessment(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assessment unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-line bg-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Market Research</p>
          <h2 className="mt-1 text-sm font-semibold text-white">Company & Market Assessment</h2>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className="inline-flex items-center gap-2 rounded border border-line bg-[#101b23] px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-300 hover:text-white disabled:opacity-50"
        >
          <FileText size={13} className="text-cyan-300" />
          {loading ? "Analyzing…" : "Run assessment"}
        </button>
      </div>
      {assessment ? (
        <div className="mt-5 space-y-4 text-xs leading-6 text-slate-300">
          <p>{assessment.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-emerald-300">Potential Catalysts</p>
              <ul className="mt-2 list-inside list-disc">
                {assessment.opportunities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-amber-300">Key Risks</p>
              <ul className="mt-2 list-inside list-disc">
                {assessment.risks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="font-mono text-[10px] text-slate-500">
            Confidence {(assessment.confidence * 100).toFixed(0)}% · Multi-source evidence synthesis
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Evaluates company announcements, regulatory filings, and market context on demand.
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
