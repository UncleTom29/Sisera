"use client";

import { Plus, X } from "lucide-react";
import { describeCondition } from "../../lib/platform";

export type RuleCondition = { type: string } & Record<string, number | string | boolean>;

type Field = {
  key: string;
  label: string;
  kind: "number" | "select" | "boolean";
  options?: string[];
  value: number | string | boolean;
};

/** Condition types, their parameters and defaults; mirrors the server's condition language. */
export const CONDITION_SPECS: Record<
  string,
  { label: string; backtestable: boolean; fields: Field[] }
> = {
  ema_trend: {
    label: "EMA trend",
    backtestable: true,
    fields: [
      { key: "fast", label: "Fast", kind: "number", value: 12 },
      { key: "slow", label: "Slow", kind: "number", value: 26 },
      {
        key: "direction",
        label: "Direction",
        kind: "select",
        options: ["bullish", "bearish"],
        value: "bullish",
      },
      { key: "requireCross", label: "Only on cross", kind: "boolean", value: false },
    ],
  },
  rsi_below: {
    label: "RSI below",
    backtestable: true,
    fields: [
      { key: "period", label: "Period", kind: "number", value: 14 },
      { key: "value", label: "Level", kind: "number", value: 30 },
    ],
  },
  rsi_above: {
    label: "RSI above",
    backtestable: true,
    fields: [
      { key: "period", label: "Period", kind: "number", value: 14 },
      { key: "value", label: "Level", kind: "number", value: 70 },
    ],
  },
  breakout_high: {
    label: "Breaks N-bar high",
    backtestable: true,
    fields: [{ key: "lookback", label: "Bars", kind: "number", value: 20 }],
  },
  breakdown_low: {
    label: "Breaks N-bar low",
    backtestable: true,
    fields: [{ key: "lookback", label: "Bars", kind: "number", value: 20 }],
  },
  relative_volume_above: {
    label: "Relative volume above",
    backtestable: true,
    fields: [
      { key: "lookback", label: "Bars", kind: "number", value: 20 },
      { key: "ratio", label: "Ratio", kind: "number", value: 1.2 },
    ],
  },
  close_above_sma: {
    label: "Close above SMA",
    backtestable: true,
    fields: [{ key: "period", label: "Period", kind: "number", value: 50 }],
  },
  close_below_sma: {
    label: "Close below SMA",
    backtestable: true,
    fields: [{ key: "period", label: "Period", kind: "number", value: 50 }],
  },
  return_above: {
    label: "Return above",
    backtestable: true,
    fields: [
      { key: "bars", label: "Bars", kind: "number", value: 5 },
      { key: "pct", label: "%", kind: "number", value: 5 },
    ],
  },
  return_below: {
    label: "Return below",
    backtestable: true,
    fields: [
      { key: "bars", label: "Bars", kind: "number", value: 5 },
      { key: "pct", label: "%", kind: "number", value: -5 },
    ],
  },
  premium_below: {
    label: "Premium to reference below",
    backtestable: false,
    fields: [{ key: "pct", label: "%", kind: "number", value: -2 }],
  },
  premium_above: {
    label: "Premium to reference above",
    backtestable: false,
    fields: [{ key: "pct", label: "%", kind: "number", value: 2 }],
  },
  liquidity_above: {
    label: "Liquidity above",
    backtestable: false,
    fields: [{ key: "usd", label: "USD", kind: "number", value: 100000 }],
  },
  volume_24h_above: {
    label: "24h volume above",
    backtestable: false,
    fields: [{ key: "usd", label: "USD", kind: "number", value: 50000 }],
  },
  no_negative_event: {
    label: "No negative event",
    backtestable: false,
    fields: [
      {
        key: "minSeverity",
        label: "Min severity",
        kind: "select",
        options: ["medium", "high", "critical"],
        value: "high",
      },
      { key: "lookbackHours", label: "Hours", kind: "number", value: 24 },
      { key: "includeRumors", label: "Count rumors", kind: "boolean", value: true },
    ],
  },
  reference_fresh: { label: "Reference price is fresh", backtestable: false, fields: [] },
};

export function defaultCondition(type: string): RuleCondition {
  const spec = CONDITION_SPECS[type];
  return {
    type,
    ...Object.fromEntries((spec?.fields ?? []).map((field) => [field.key, field.value])),
  };
}

export function RuleList({
  title,
  conditions,
  onChange,
}: { title: string; conditions: RuleCondition[]; onChange: (next: RuleCondition[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-300">{title}</span>
        <select
          aria-label={`Add ${title.toLowerCase()} condition`}
          className="h-7 border border-line bg-ink px-2 text-[11px] text-slate-300"
          value=""
          onChange={(event) => {
            if (event.target.value) onChange([...conditions, defaultCondition(event.target.value)]);
          }}
        >
          <option value="">Add condition…</option>
          {Object.entries(CONDITION_SPECS).map(([type, spec]) => (
            <option key={type} value={type}>
              {spec.label}
              {spec.backtestable ? "" : " (live only)"}
            </option>
          ))}
        </select>
      </div>
      {conditions.length === 0 && <p className="text-[11px] text-slate-500">No conditions.</p>}
      {conditions.map((condition, index) => {
        const spec = CONDITION_SPECS[condition.type];
        return (
          <div key={`${condition.type}-${index}`} className="border border-line bg-ink p-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-bone">{describeCondition(condition)}</span>
              <button
                type="button"
                aria-label="Remove condition"
                className="text-slate-500 hover:text-rose-300"
                onClick={() => onChange(conditions.filter((_, position) => position !== index))}
              >
                <X size={12} />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {spec?.fields.map((field) => (
                // biome-ignore lint/a11y/noLabelWithoutControl: each branch below renders the labelled control
                <label
                  key={field.key}
                  className="flex items-center gap-1 text-[10px] text-slate-400"
                >
                  {field.label}
                  {field.kind === "select" ? (
                    <select
                      className="h-6 border border-line bg-panel px-1 text-[11px] text-bone"
                      value={String(condition[field.key])}
                      onChange={(event) =>
                        onChange(
                          conditions.map((item, position) =>
                            position === index
                              ? { ...item, [field.key]: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      {field.options?.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  ) : field.kind === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(condition[field.key])}
                      onChange={(event) =>
                        onChange(
                          conditions.map((item, position) =>
                            position === index
                              ? { ...item, [field.key]: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                  ) : (
                    <input
                      className="h-6 w-20 border border-line bg-panel px-1 text-[11px] text-bone"
                      inputMode="decimal"
                      value={String(condition[field.key])}
                      onChange={(event) =>
                        onChange(
                          conditions.map((item, position) =>
                            position === index
                              ? { ...item, [field.key]: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {conditions.length === 0 && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-bronze-200"
          onClick={() => onChange([defaultCondition("ema_trend")])}
        >
          <Plus size={11} /> Start with an EMA trend
        </button>
      )}
    </div>
  );
}
