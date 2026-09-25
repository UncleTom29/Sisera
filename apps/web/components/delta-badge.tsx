import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export function DeltaBadge({ value }: { value: string | number | null | undefined }) {
  if (value === undefined || value === null || value === "") {
    return <span className="font-mono text-xs text-slate-500">—</span>;
  }
  const delta = Number(value);
  if (!Number.isFinite(delta)) {
    return <span className="font-mono text-xs text-slate-500">—</span>;
  }
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const tone =
    delta > 0
      ? "bg-emerald-400/10 text-emerald-300"
      : delta < 0
        ? "bg-rose-400/10 text-rose-300"
        : "bg-slate-400/10 text-slate-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-xs ${tone}`}>
      <Icon size={13} strokeWidth={1.8} />
      {delta > 0 ? "+" : ""}
      {delta.toFixed(2)}%
    </span>
  );
}
