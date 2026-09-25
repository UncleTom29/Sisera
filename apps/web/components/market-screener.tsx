"use client";

import { formatPercent } from "@sisera/ui";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { MarketRow } from "../lib/api";

export function MarketScreener({ rows }: { rows: MarketRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "volume", desc: true }]);
  const [filter, setFilter] = useState("");
  const columns = useMemo<ColumnDef<MarketRow>[]>(
    () => [
      {
        id: "market",
        accessorFn: (row) => row.instrument.displaySymbol,
        header: "Market",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-full bg-slate-800 font-mono text-[10px] font-semibold text-slate-300">
              {row.original.instrument.baseAsset.slice(0, 1)}
            </span>
            <div>
              <p className="font-mono text-[11px] font-semibold text-slate-200">
                {row.original.instrument.displaySymbol}
              </p>
              <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-slate-700">
                {row.original.instrument.venue} · {row.original.instrument.type}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "price",
        accessorFn: (row) => Number(row.snapshot.last),
        header: "Last price",
        cell: ({ row }) => (
          <span className="data-value text-slate-200">
            $
            {Number(row.original.snapshot.last).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}
          </span>
        ),
      },
      {
        id: "change",
        accessorFn: (row) => Number(row.snapshot.change24hPct ?? 0),
        header: "24h change",
        cell: ({ row }) => {
          const value = Number(row.original.snapshot.change24hPct ?? 0);
          return (
            <span className={`data-value ${value >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {formatPercent(value)}
            </span>
          );
        },
      },
      {
        id: "volume",
        accessorFn: (row) => Number(row.snapshot.volume24h ?? 0),
        header: "24h volume",
        cell: ({ row }) => (
          <span className="data-value text-slate-300">
            {formatCompact(row.original.snapshot.volume24h)}
          </span>
        ),
      },
      {
        id: "spread",
        accessorFn: (row) => Number(row.snapshot.ask) - Number(row.snapshot.bid),
        header: "Spread",
        cell: ({ row }) => (
          <span className="data-value text-slate-400">{spreadBps(row.original)} bps</span>
        ),
      },
      {
        id: "source",
        accessorFn: (row) => row.snapshot.quality.source,
        header: "Source",
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-[9px] text-slate-400">
              {row.original.snapshot.quality.source}
            </p>
            <p className="mt-1 font-mono text-[8px] text-emerald-300">
              LIVE · {row.original.snapshot.quality.latencyMs}ms
            </p>
          </div>
        ),
      },
      {
        id: "action",
        enableSorting: false,
        header: "",
        cell: ({ row }) => (
          <Link
            href={`/terminal?symbol=${row.original.instrument.venueSymbol}`}
            className="inline-flex h-7 items-center border border-cyan-400/30 bg-cyan-400/[0.08] px-3 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-400/[0.14]"
          >
            Trade
          </Link>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <section className="overflow-hidden border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-7 border border-cyan-400/30 bg-cyan-400/10 px-3 text-[10px] text-cyan-300"
          >
            All markets
          </button>
          <button type="button" className="h-7 border border-line px-3 text-[10px] text-slate-500">
            Spot
          </button>
          <button type="button" className="h-7 border border-line px-3 text-[10px] text-slate-500">
            Perpetuals
          </button>
          <button type="button" className="h-7 border border-line px-3 text-[10px] text-slate-500">
            Outcomes
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center gap-2 border border-line bg-[#080c12] px-3">
            <Search size={12} className="text-slate-600" />
            <input
              aria-label="Filter instruments"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter instruments"
              className="w-36 bg-transparent text-[10px] outline-none placeholder:text-slate-700"
            />
          </div>
          <button
            type="button"
            className="flex h-8 items-center gap-2 border border-line px-3 text-[10px] text-slate-500"
          >
            <SlidersHorizontal size={12} /> Filters
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-[10px]">
          <thead className="bg-[#090e14] text-slate-600">
            <tr>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <th
                  key={header.id}
                  className="h-10 border-b border-line px-4 font-mono font-normal uppercase tracking-wider"
                >
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className="flex items-center gap-1.5"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && <ArrowUpDown size={10} />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-line hover:bg-cyan-400/[0.025]">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="h-14 px-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex h-10 items-center justify-between border-t border-line px-4 font-mono text-[9px] uppercase tracking-wider text-slate-700">
        <span>{table.getRowModel().rows.length} verified markets</span>
        <span>Provider timestamps shown · no derived volume</span>
      </div>
    </section>
  );
}

function spreadBps(row: MarketRow) {
  const mid = (Number(row.snapshot.bid) + Number(row.snapshot.ask)) / 2;
  return mid === 0
    ? "—"
    : (((Number(row.snapshot.ask) - Number(row.snapshot.bid)) / mid) * 10_000).toFixed(2);
}
function formatCompact(value?: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(
        number,
      )
    : "—";
}
