import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 border-b border-line px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="data-label text-cyan-300">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.035em] text-white">{title}</h1>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {actions}
    </div>
  );
}
