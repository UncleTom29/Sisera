"use client";

import { Download } from "lucide-react";

type ExportRow = {
  source: string;
  asset: string;
  quantity: string;
  observedPriceUsd: string;
  observedValueUsd: string;
  observedAt: string;
};

function csvCell(value: string) {
  const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function PortfolioExport({ rows }: { rows: ExportRow[] }) {
  return (
    <button
      type="button"
      disabled={!rows.length}
      onClick={() => {
        const header = [
          "Source",
          "Asset",
          "Quantity",
          "Observed price USD",
          "Observed value USD",
          "Observed at",
        ];
        const csv = [header, ...rows.map((row) => Object.values(row))]
          .map((line) => line.map(csvCell).join(","))
          .join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "sisera-observed-holdings.csv";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
      className="inline-flex items-center gap-1.5 text-[10px] text-cyan-300 disabled:text-slate-700"
    >
      <Download size={12} /> Export observations
    </button>
  );
}
