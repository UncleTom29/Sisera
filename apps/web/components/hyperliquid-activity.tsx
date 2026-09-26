"use client";

import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

type Fill = {
  oid: number;
  coin: string;
  side: "B" | "A";
  sz: string;
  px: string;
  closedPnl: string;
  time: number;
};

export function HyperliquidActivity() {
  const { wallets } = useWallets();
  const address = wallets[0]?.address;
  const [fills, setFills] = useState<Fill[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!address) return;
    let active = true;
    const info = new InfoClient({ transport: new HttpTransport() });
    void info
      .userFills({ user: address as `0x${string}` })
      .then((rows) => {
        if (active) setFills(rows.slice(0, 20));
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [address]);
  return (
    <section className="mt-4 border border-line bg-panel">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-white">
        Hyperliquid wallet fills
      </h2>
      {!address ? (
        <p className="p-5 text-xs text-slate-400">
          Connect an EVM wallet to load its public Hyperliquid fills.
        </p>
      ) : error ? (
        <p className="p-5 text-xs text-slate-400">Hyperliquid fills are unavailable.</p>
      ) : !fills ? (
        <p className="p-5 text-xs text-slate-400">Loading wallet fills…</p>
      ) : fills.length === 0 ? (
        <p className="p-5 text-xs text-slate-400">No fills for this wallet.</p>
      ) : (
        <div className="divide-y divide-line">
          {fills.map((fill) => (
            <div
              key={`${fill.oid}:${fill.time}`}
              className="grid grid-cols-[140px_80px_1fr_110px] gap-3 px-4 py-3 font-mono text-[11px] text-slate-300"
            >
              <span>{new Date(fill.time).toLocaleString()}</span>
              <span>{fill.side === "B" ? "Buy" : "Sell"}</span>
              <span>
                {fill.coin} · {fill.sz} at {fill.px} USDC
              </span>
              <span className="text-right">PnL {Number(fill.closedPnl).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
