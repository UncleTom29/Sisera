"use client";

import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

export function OrderTicket({
  bid,
  ask,
  symbol,
  quoteAsset,
}: { bid: string | undefined; ask: string | undefined; symbol: string; quoteAsset: string }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const indicativePrice = orderType === "limit" ? limitPrice : side === "buy" ? ask : bid;
  const notional = useMemo(() => {
    const value = Number(quantity) * Number(indicativePrice);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [indicativePrice, quantity]);

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-12 items-center justify-between border-b border-line px-4">
        <span className="text-sm font-semibold text-slate-100">Order ticket</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-cyan-300">
          <ShieldCheck size={13} /> Paper
        </span>
      </div>
      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 rounded-md border border-line bg-[#0f1a22] p-1">
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`h-9 rounded text-xs font-semibold ${side === "buy" ? "bg-emerald-400/15 text-emerald-300" : "text-slate-400"}`}
          >
            Buy / Long
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`h-9 rounded text-xs font-semibold ${side === "sell" ? "bg-rose-400/15 text-rose-300" : "text-slate-400"}`}
          >
            Sell / Short
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label>
            <span className="data-label">Order type</span>
            <select
              value={orderType}
              onChange={(event) => setOrderType(event.target.value as "market" | "limit")}
              className="mt-2 h-10 w-full rounded-md border border-line bg-[#0f1a22] px-3 text-xs text-slate-200 outline-none"
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </label>
          <label>
            <span className="data-label">Time in force</span>
            <select
              disabled
              className="mt-2 h-10 w-full rounded-md border border-line bg-[#0f1a22] px-3 text-xs text-slate-500 outline-none"
            >
              <option>GTC</option>
              <option>IOC</option>
              <option>FOK</option>
            </select>
          </label>
        </div>
        {orderType === "limit" && (
          <label className="mt-4 block">
            <span className="data-label">Limit price · {quoteAsset}</span>
            <input
              value={limitPrice}
              onChange={(event) => setLimitPrice(event.target.value)}
              inputMode="decimal"
              placeholder={side === "buy" ? ask : bid}
              className="data-value mt-2 h-11 w-full rounded-md border border-line bg-[#0f1a22] px-3 text-right text-sm text-slate-100 outline-none focus:border-cyan-400/50"
            />
          </label>
        )}
        <label className="mt-4 block">
          <span className="data-label">Quantity · {symbol.replace("USDT", "")}</span>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="decimal"
            placeholder="0.00000"
            className="data-value mt-2 h-11 w-full rounded-md border border-line bg-[#0f1a22] px-3 text-right text-sm text-slate-100 outline-none focus:border-cyan-400/50"
          />
        </label>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {[25, 50, 75, 100].map((percent) => (
            <span
              key={percent}
              className="grid h-7 place-items-center rounded border border-line font-mono text-[10px] text-slate-500"
            >
              {percent}%
            </span>
          ))}
        </div>
        <div className="mt-6 divide-y divide-line border-y border-line text-xs">
          <TicketRow label="Indicative price" value={indicativePrice ?? "—"} />
          <TicketRow
            label="Estimated notional"
            value={
              notional
                ? `$${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : "—"
            }
          />
          <TicketRow label="Fee model" value="Venue schedule" />
          <TicketRow label="Buying power" value="Portfolio required" />
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" disabled className="accent-cyan-300" /> Reduce only
        </label>
        <button
          type="button"
          disabled
          className="mt-5 h-11 w-full rounded-md border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-500"
        >
          Connect a reconciled portfolio
        </button>
        <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[11px] leading-5 text-amber-100/70">
          Orders remain disabled until account balances, mandate limits, and identity are verified
          server-side.
        </div>
      </div>
    </div>
  );
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-slate-400">{label}</span>
      <span className="data-value text-slate-300">{value}</span>
    </div>
  );
}
