"use client";

import { useEffect, useState } from "react";

type BridgeTransfer = {
  requestId: string;
  originChainId: number;
  destinationChainId: number;
  originAmountUsdc: string;
  quotedOutputUsdc: string;
  status: string;
  sourceTxHash: string | null;
  destinationTxHash: string | null;
  quotedAt: string;
};

export function BridgeActivity() {
  const [transfers, setTransfers] = useState<BridgeTransfer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/bridge", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? "Bridge history is unavailable.");
        return payload.data as BridgeTransfer[];
      })
      .then((rows) => {
        if (active) setTransfers(rows);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Bridge history is unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function refresh(requestId: string) {
    setRefreshing(requestId);
    setError(null);
    try {
      const response = await fetch(`/api/bridge?requestId=${encodeURIComponent(requestId)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Bridge status is unavailable.");
      setTransfers(
        (current) =>
          current?.map((transfer) =>
            transfer.requestId === requestId
              ? {
                  ...transfer,
                  status: payload.data.status,
                  sourceTxHash: payload.data.inTxHashes?.[0] ?? transfer.sourceTxHash,
                  destinationTxHash: payload.data.txHashes?.[0] ?? transfer.destinationTxHash,
                }
              : transfer,
          ) ?? null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bridge status is unavailable.");
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <section className="mt-4 border border-line bg-panel">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-white">
        USDC bridge history
      </h2>
      {error && <p className="border-b border-line p-4 text-xs text-amber-200">{error}</p>}
      {transfers === null && !error ? (
        <p className="p-5 text-xs text-slate-400">Checking account bridge history…</p>
      ) : transfers?.length === 0 ? (
        <p className="p-5 text-xs text-slate-400">No account bridges have been quoted.</p>
      ) : transfers ? (
        <div className="divide-y divide-line">
          {transfers.map((transfer) => (
            <div key={transfer.requestId} className="p-4 text-xs text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-slate-500">
                  {new Date(transfer.quotedAt).toLocaleString()} · {transfer.originChainId} →{" "}
                  {transfer.destinationChainId}
                </span>
                <span className="text-cyan-300">{transfer.status.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-2">
                {transfer.originAmountUsdc} USDC in · quoted {transfer.quotedOutputUsdc} USDC out
              </p>
              <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                Relay request {transfer.requestId}
              </p>
              {transfer.sourceTxHash && (
                <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                  Source transaction {transfer.sourceTxHash}
                </p>
              )}
              {transfer.destinationTxHash && (
                <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                  Destination transaction {transfer.destinationTxHash}
                </p>
              )}
              <button
                type="button"
                disabled={refreshing === transfer.requestId}
                onClick={() => void refresh(transfer.requestId)}
                className="mt-3 rounded border border-line px-3 py-2 text-cyan-300 disabled:opacity-50"
              >
                Refresh status
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
