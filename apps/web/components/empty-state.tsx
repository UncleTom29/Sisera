import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  copy,
  code,
}: { icon: LucideIcon; title: string; copy: string; code: string }) {
  return (
    <div className="grid min-h-56 place-items-center border border-dashed border-slate-800 bg-[#080c12]">
      <div className="max-w-sm px-6 text-center">
        <Icon className="mx-auto text-slate-700" size={22} strokeWidth={1.5} />
        <p className="mt-4 text-sm font-semibold text-slate-300">{title}</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">{copy}</p>
        <p className="mt-4 font-mono text-[9px] uppercase tracking-widest text-slate-700">{code}</p>
      </div>
    </div>
  );
}
