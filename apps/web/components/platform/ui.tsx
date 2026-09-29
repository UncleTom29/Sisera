import type { ReactNode } from "react";
import type { Certainty, Severity } from "../../lib/platform";

export function Panel({
  title,
  actions,
  children,
  className = "",
}: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border border-line bg-panel ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-bone">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "positive" | "negative" | "warning";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-300"
        : tone === "warning"
          ? "text-amber-200"
          : "text-bone";
  return (
    <div className="border border-line bg-ink p-3">
      <p className="data-label text-slate-500">{label}</p>
      <p className={`num mt-1 text-lg ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

const CERTAINTY: Record<Certainty, { label: string; className: string; title: string }> = {
  confirmed: {
    label: "Confirmed",
    className: "border-emerald-500/40 text-emerald-300",
    title: "A regulatory filing or the issuer confirms this.",
  },
  corroborated: {
    label: "Corroborated",
    className: "border-verdigris-400/40 text-verdigris-300",
    title: "Two or more independent publishers report this.",
  },
  single_source: {
    label: "Single source",
    className: "border-slate-600 text-slate-300",
    title: "One publisher reports this without independent confirmation.",
  },
  rumor: {
    label: "Unconfirmed",
    className: "border-amber-500/40 text-amber-200",
    title: "Reports use unconfirmed language (reportedly, people familiar).",
  },
  unverified_social: {
    label: "Social · unverified",
    className: "border-rose-500/30 text-rose-200",
    title: "Only social posts report this.",
  },
};

export function CertaintyBadge({ certainty }: { certainty: Certainty }) {
  const item = CERTAINTY[certainty] ?? CERTAINTY.single_source;
  return (
    <span
      title={item.title}
      className={`inline-flex h-5 items-center border px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] ${item.className}`}
    >
      {item.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const className =
    severity === "critical"
      ? "bg-rose-500/20 text-rose-200 border-rose-500/40"
      : severity === "high"
        ? "bg-amber-500/15 text-amber-200 border-amber-500/40"
        : severity === "medium"
          ? "text-bronze-200 border-bronze-500/40"
          : "text-slate-400 border-slate-700";
  return (
    <span
      className={`inline-flex h-5 items-center border px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] ${className}`}
    >
      {severity}
    </span>
  );
}

export function SentimentDot({ sentiment }: { sentiment: string }) {
  const color =
    sentiment === "positive"
      ? "bg-emerald-400"
      : sentiment === "negative"
        ? "bg-rose-400"
        : sentiment === "mixed"
          ? "bg-amber-300"
          : "bg-slate-500";
  return (
    <span
      title={`Sentiment: ${sentiment}`}
      className={`inline-block size-2 rounded-full ${color}`}
    />
  );
}

export function Note({
  tone = "neutral",
  children,
}: { tone?: "neutral" | "warning" | "error" | "positive"; children: ReactNode }) {
  const className =
    tone === "error"
      ? "border-rose-500/30 text-rose-200"
      : tone === "warning"
        ? "border-amber-400/30 text-amber-200"
        : tone === "positive"
          ? "border-emerald-500/30 text-emerald-200"
          : "border-line text-slate-400";
  return <p className={`border p-3 text-xs leading-5 ${className}`}>{children}</p>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="animate-pulse p-4 text-xs text-slate-500">{label}</p>;
}

export function StageTrack({ stage }: { stage: string }) {
  const stages = ["draft", "backtest", "stress_test", "paper", "shadow", "limited_live", "live"];
  const index = stages.indexOf(stage);
  return (
    <div className="flex items-center gap-1" aria-label={`Stage ${stage}`}>
      {stages.map((item, position) => (
        <span
          key={item}
          title={item.replace("_", " ")}
          className={`h-1.5 w-6 ${stage === "paused" ? "bg-rose-500/40" : position <= index ? "bg-bronze-300" : "bg-slate-700"}`}
        />
      ))}
    </div>
  );
}

export const inputClass =
  "h-9 w-full border border-line bg-ink px-2 text-xs text-bone outline-none placeholder:text-slate-600 focus:border-bronze-400";
export const buttonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 border border-bronze-300 bg-bronze-300 px-3 text-[12px] font-semibold text-ink hover:bg-bronze-200 disabled:pointer-events-none disabled:opacity-40";
export const ghostButtonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 border border-line px-3 text-[12px] text-slate-300 hover:border-line-strong hover:text-bone disabled:pointer-events-none disabled:opacity-40";
export const dangerButtonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 border border-rose-500/50 bg-rose-500/10 px-3 text-[12px] text-rose-200 hover:bg-rose-500/20 disabled:pointer-events-none disabled:opacity-40";
