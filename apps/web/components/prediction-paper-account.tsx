"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

type PaperAccount = {
  cashUsd: string;
  positions: Record<string, { contracts: string; costUsd: string }>;
};
type PaperOrder = {
  id: string;
  marketId: string;
  outcome: "yes" | "no";
  depositUsd: string;
  fillPriceUsd: string;
  contracts: string;
  status: string;
  createdAt: string;
};

export function PredictionPaperAccount() {
  const { authenticated } = usePrivy();
  const [data, setData] = useState<{ account: PaperAccount; orders: PaperOrder[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    const load = () => {
      void fetch("/api/prediction-paper", { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message ?? "Paper account unavailable.");
          if (active) {
            setData(payload.data);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (active) {
            setData(null);
            setError(reason instanceof Error ? reason.message : "Paper account unavailable.");
          }
        });
    };
    load();
    window.addEventListener("sisera:prediction-paper-filled", load);
    window.addEventListener("sisera:session-renewed", load);
    return () => {
      active = false;
      window.removeEventListener("sisera:prediction-paper-filled", load);
      window.removeEventListener("sisera:session-renewed", load);
    };
  }, [authenticated]);

  if (!authenticated) return null;
  return (
    <section className="mb-4 border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold text-white">Prediction paper account</h2>
      <p className="mt-1 text-[11px] text-slate-400">
        Simulated USDC and contracts. Positions are not resolved or marked to market yet.
      </p>
      {error && <p className="mt-3 text-xs text-amber-300">{error}</p>}
      {data && (
        <>
          <p className="mt-3 font-mono text-lg text-bronze-300">
            ${Number(data.account.cashUsd).toLocaleString()} paper USDC
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {Object.keys(data.account.positions).length} open outcome positions ·{" "}
            {data.orders.length} recorded paper orders
          </p>
          {Object.entries(data.account.positions).length > 0 && (
            <div className="mt-3 divide-y divide-line border-t border-line">
              {Object.entries(data.account.positions).map(([instrument, position]) => (
                <div key={instrument} className="flex flex-wrap justify-between gap-2 py-2 text-xs">
                  <span className="break-all font-mono text-slate-300">{instrument}</span>
                  <span className="font-mono text-slate-400">
                    {Number(position.contracts).toFixed(2)} contracts ·{" "}
                    {Number(position.costUsd).toFixed(2)} USDC cost
                  </span>
                </div>
              ))}
            </div>
          )}
          {data.orders.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-line pt-3">
              {data.orders.slice(0, 5).map((order) => (
                <p key={order.id} className="truncate font-mono text-[10px] text-slate-400">
                  {order.outcome.toUpperCase()} · {order.marketId} · ${order.depositUsd} at $
                  {order.fillPriceUsd} · {Number(order.contracts).toFixed(2)} contracts
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
