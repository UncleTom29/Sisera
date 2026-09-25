import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import { type ClassValue, clsx } from "clsx";
import type * as React from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap border px-4 text-[12px] font-semibold tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "border-cyan-300 bg-cyan-300 text-slate-950 hover:bg-cyan-200",
        secondary:
          "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800",
        ghost:
          "border-transparent bg-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-100",
        danger: "border-rose-500/60 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
      },
      size: { sm: "h-8 px-3", md: "h-9 px-4", lg: "h-11 px-5 text-[13px]" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ asChild, className, variant, size, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "positive" | "negative" | "warning" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-slate-700 bg-slate-900 text-slate-400",
    positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    negative: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center border px-1.5 font-mono text-[10px] uppercase tracking-[0.1em]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function formatMoney(value?: string | number | null, currency = "USD") {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatPercent(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}
