"use client";

import { useState } from "react";

type Readiness = {
  measuredAt: string;
  markets: Array<{
    symbol: string;
    status: string;
    bars: number;
    start?: string;
    end?: string;
    missingIntervals?: number;
    reason?: string;
  }>;
  gates: Array<{ name: string; passed: boolean }>;
};

export function AgentReadiness({ id }: { id: string }) {
  const [report, setReport] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function inspect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/readiness?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Readiness check failed.");
      setReport(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Readiness check failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 border-t border-line pt-3">
      <button
        type="button"
        onClick={inspect}
        disabled={busy}
        className="rounded border border-cyan-400/30 px-2 py-1 text-[10px] text-cyan-300 disabled:opacity-50"
      >
        {busy ? "Checking data…" : "Inspect evaluation readiness"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[10px] text-amber-300">
          {error}
        </p>
      )}
      {report && (
        <div className="mt-3 space-y-3 text-[10px] text-slate-400">
          <p>
            Measured {new Date(report.measuredAt).toLocaleString()} · data diagnostics only; no
            backtest has run.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.markets.map((market) => (
              <div key={market.symbol} className="border border-line bg-ink p-2">
                <p className="font-mono text-slate-200">
                  {market.symbol} · {market.status}
                </p>
                <p className="mt-1">
                  {market.bars} bars
                  {market.missingIntervals == null
                    ? ""
                    : ` · ${market.missingIntervals} missing intervals`}
                </p>
                {market.reason && <p className="mt-1">{market.reason}</p>}
                {market.start && market.end && (
                  <p className="mt-1">
                    {new Date(market.start).toLocaleDateString()}–
                    {new Date(market.end).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {report.gates.map((gate) => (
              <span
                key={gate.name}
                className={`rounded border px-2 py-1 ${gate.passed ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300"}`}
              >
                {gate.passed ? "✓" : "○"} {gate.name}
              </span>
            ))}
          </div>
          <p>
            Human-written factors need executable, reviewed rules before a valid backtest. This
            draft cannot place orders.
          </p>
        </div>
      )}
    </div>
  );
}
