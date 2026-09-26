import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReferenceMarket } from "../lib/api";
import { DeltaBadge } from "./delta-badge";

export function ReferenceScreener({ rows }: { rows: ReferenceMarket[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Reference markets</h2>
          <p className="mt-1 text-xs text-slate-400">
            CoinGecko USD reference prices. Binance venue quotes, depth, and execution are
            unavailable.
          </p>
        </div>
        <span className="rounded-md border border-amber-400/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-amber-200">
          Reference only
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-xs">
          <thead className="bg-[#101b23] font-mono text-[10px] uppercase tracking-wider text-slate-400">
            <tr className="border-b border-line">
              <th className="h-11 px-5 font-medium">Market</th>
              <th className="px-5 font-medium">Price · USD</th>
              <th className="px-5 font-medium">24h change</th>
              <th className="px-5 font-medium">24h volume · USD</th>
              <th className="px-5 font-medium">Observed</th>
              <th className="px-5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className="border-b border-line hover:bg-white/[0.035]">
                <td className="h-16 px-5">
                  <p className="text-sm font-semibold text-slate-100">{row.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                    {row.symbol.replace("USDT", "")} / USD
                  </p>
                </td>
                <td className="px-5 font-mono text-[13px] text-slate-100">
                  ${row.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </td>
                <td className="px-5">
                  <DeltaBadge value={row.change24hPct?.toString()} />
                </td>
                <td className="px-5 font-mono text-[13px] text-slate-200">
                  {row.volume24hUsd?.toLocaleString(undefined, {
                    notation: "compact",
                    maximumFractionDigits: 2,
                  }) ?? "—"}
                </td>
                <td className="px-5 font-mono text-[11px] text-slate-400">
                  {new Date(row.observedAt).toLocaleTimeString()}
                </td>
                <td className="px-5">
                  <Link
                    href={`/spot/${row.symbol}`}
                    className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                  >
                    Inspect <ArrowUpRight size={13} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 font-mono text-[10px] uppercase tracking-wide text-slate-500">
        Reference data is not a venue quote and cannot be used for order pricing.
      </p>
    </section>
  );
}
