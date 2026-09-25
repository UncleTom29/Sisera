"use client";

import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

export function OrderTicket({
  bid,
  ask,
  symbol,
}: { bid: string | undefined; ask: string | undefined; symbol: string }) {
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
    <div className="flex h-full flex-col bg-[#090d13]">
      <div className="flex h-10 items-center justify-between border-b border-line px-3">
        <span className="text-[11px] font-semibold text-slate-200">Paper order</span>
        <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
          <ShieldCheck size={11} /> Risk gated
        </span>
      </div>
      <div className="flex-1 p-3">
        <div className="grid grid-cols-2 border border-line bg-panel">
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`h-9 text-[11px] font-semibold ${side === "buy" ? "bg-emerald-400/15 text-emerald-300" : "text-slate-600"}`}
          >
            Buy / Long
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`h-9 border-l border-line text-[11px] font-semibold ${side === "sell" ? "bg-rose-400/15 text-rose-300" : "text-slate-600"}`}
          >
            Sell / Short
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label>
            <span className="data-label">Order type</span>
            <select
              value={orderType}
              onChange={(event) => setOrderType(event.target.value as "market" | "limit")}
              className="mt-1.5 h-9 w-full border border-line bg-panel px-2 text-[11px] text-slate-300 outline-none"
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </label>
          <label>
            <span className="data-label">Time in force</span>
            <select className="mt-1.5 h-9 w-full border border-line bg-panel px-2 text-[11px] text-slate-300 outline-none">
              <option>GTC</option>
              <option>IOC</option>
              <option>FOK</option>
            </select>
          </label>
        </div>
        {orderType === "limit" && (
          <label className="mt-4 block">
            <span className="data-label">Limit price · USDT</span>
            <input
              value={limitPrice}
              onChange={(event) => setLimitPrice(event.target.value)}
              inputMode="decimal"
              placeholder={side === "buy" ? ask : bid}
              className="data-value mt-1.5 h-10 w-full border border-line bg-panel px-3 text-right text-xs text-slate-100 outline-none focus:border-cyan-400/50"
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
            className="data-value mt-1.5 h-10 w-full border border-line bg-panel px-3 text-right text-xs text-slate-100 outline-none focus:border-cyan-400/50"
          />
        </label>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {[25, 50, 75, 100].map((percent) => (
            <button
              key={percent}
              type="button"
              disabled
              className="h-6 border border-line font-mono text-[9px] text-slate-700"
            >
              {percent}%
            </button>
          ))}
        </div>
        <div className="mt-5 divide-y divide-line border-y border-line text-[10px]">
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
        <label className="mt-4 flex items-center gap-2 text-[10px] text-slate-500">
          <input type="checkbox" disabled className="accent-cyan-300" /> Reduce only
        </label>
        <button
          type="button"
          disabled
          className="mt-5 h-10 w-full border border-slate-700 bg-slate-800/80 text-[11px] font-semibold text-slate-500"
        >
          Connect a reconciled portfolio
        </button>
        <div className="mt-3 border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[9px] leading-4 text-amber-100/60">
          Orders remain disabled until account balances, mandate limits, and identity are verified
          server-side.
        </div>
      </div>
    </div>
  );
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-slate-600">{label}</span>
      <span className="data-value text-slate-300">{value}</span>
    </div>
  );
}
