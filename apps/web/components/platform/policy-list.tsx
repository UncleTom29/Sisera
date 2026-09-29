"use client";

import { useCallback, useEffect, useState } from "react";
import { type PolicyRow, ago, describeCondition, platform, usd } from "../../lib/platform";
import { useSolanaSigner } from "../../lib/use-solana-signer";
import { Loading, Note, Panel, buttonClass, dangerButtonClass, ghostButtonClass } from "./ui";

const STATUS_TONE: Record<string, string> = {
  active: "text-verdigris-300",
  awaiting_approval: "text-amber-200",
  executing: "text-bronze-200",
  executed: "text-emerald-300",
  failed: "text-rose-300",
  cancelled: "text-slate-500",
  expired: "text-slate-500",
  invalidated: "text-slate-400",
  draft: "text-slate-300",
};

/** Armed conversational policies, their live evaluation, and approval of triggered ones. */
export function PolicyList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<PolicyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const signer = useSolanaSigner();

  const load = useCallback(() => {
    platform<PolicyRow[]>("policies")
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => {
    void refreshKey;
    load();
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
  }, [load, refreshKey]);

  const act = async (row: PolicyRow, action: "activate" | "cancel" | "approve") => {
    setBusy(row.id);
    setError(null);
    try {
      const result = await platform<{
        status?: string;
        prepared?: { orderId: string; transaction: string };
      }>(`policies/${row.id}/${action}`, { body: {} });
      if (action === "approve" && result?.prepared) {
        const [signedTransaction] = await signer.signAll([result.prepared.transaction]);
        await platform(`policies/${row.id}/execute`, {
          body: { orderId: result.prepared.orderId, signedTransaction },
        });
      }
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action failed.");
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Trading policies">
      {error && (
        <div className="p-3">
          <Note tone="warning">{error}</Note>
        </div>
      )}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && (
        <p className="p-4 text-xs text-slate-400">
          No policies yet. Describe a conditional trade to Sisera AI to create one.
        </p>
      )}
      <ul>
        {rows?.map((row) => (
          <li key={row.id} className="border-b border-line/60 px-4 py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-bone">{row.name}</span>
              <span className="font-mono text-[10px] uppercase text-slate-500">{row.mode}</span>
              <span
                className={`ml-auto font-mono text-[10px] uppercase ${STATUS_TONE[row.status] ?? "text-slate-400"}`}
              >
                {row.status.replace("_", " ")}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {row.policy.triggers.length
                ? `When ${row.policy.triggers.map(describeCondition).join(" · ")}`
                : "Executes on activation"}{" "}
              · expires {ago(row.policy.invalidation.expiresAt).replace(" ago", "")}
              {row.policy.execution.requireApproval ? " · asks for approval" : " · automatic"}
            </p>
            {row.lastEvaluation?.triggers && row.status === "active" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.lastEvaluation.triggers.map((result) => (
                  <span
                    key={JSON.stringify(result.condition)}
                    title={result.detail}
                    className={`border px-1.5 py-0.5 font-mono text-[10px] ${result.passed ? "border-emerald-500/40 text-emerald-300" : result.dataAvailable ? "border-line text-slate-400" : "border-amber-500/40 text-amber-200"}`}
                  >
                    {describeCondition(result.condition)}: {result.actual ?? "no data"}
                  </span>
                ))}
              </div>
            )}
            {row.lastEvaluation?.reasons &&
              row.lastEvaluation.reasons.length > 0 &&
              row.status !== "executed" && (
                <p className="mt-1 text-[11px] text-slate-500">{row.lastEvaluation.reasons[0]}</p>
              )}
            {row.execution && (row.status === "executed" || row.status === "failed") && (
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                {row.execution.fillPrice ? `Filled at ${usd(Number(row.execution.fillPrice))}` : ""}
                {row.execution.signature
                  ? ` · ${String(row.execution.signature).slice(0, 12)}…`
                  : ""}
                {row.execution.error ? ` ${String(row.execution.error)}` : ""}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              {row.status === "draft" && (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy === row.id}
                  onClick={() => act(row, "activate")}
                >
                  Activate
                </button>
              )}
              {row.status === "awaiting_approval" && (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy === row.id || (row.mode === "live" && !signer.ready)}
                  onClick={() => act(row, "approve")}
                >
                  {row.mode === "live" ? "Approve & sign" : "Approve paper order"}
                </button>
              )}
              {["draft", "active", "awaiting_approval"].includes(row.status) && (
                <button
                  type="button"
                  className={row.status === "active" ? ghostButtonClass : dangerButtonClass}
                  disabled={busy === row.id}
                  onClick={() => act(row, "cancel")}
                >
                  Cancel
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
