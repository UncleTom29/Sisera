"use client";

import { useState } from "react";

type Report = {
  market: string;
  source: string;
  observedAt: string;
  stance: "watch_long" | "watch_short" | "abstain";
  rationale: string[];
};

export function AgentResearch({ id }: { id: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/agents/research?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Research unavailable.");
      setReport(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 border-t border-line pt-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded border border-cyan-400/30 px-2 py-1 text-[10px] text-cyan-300 disabled:opacity-50"
      >
        {busy ? "Researching…" : "Run current research"}
      </button>
      {message && <p className="mt-2 text-[10px] text-amber-300">{message}</p>}
      {report && (
        <div className="mt-3 text-[10px] leading-5 text-slate-300">
          <p className="font-mono text-cyan-300">
            {report.market} · {report.stance.replaceAll("_", " ")}
          </p>
          <p className="text-slate-500">
            {report.source} · {new Date(report.observedAt).toLocaleString()}
          </p>
          <ul className="mt-1 list-inside list-disc">
            {report.rationale.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
