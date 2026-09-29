/**
 * One rule for every signed number in Sisera: a minus is red, a plus is green, zero and missing
 * values are neutral. Use these helpers instead of choosing colours case by case.
 */
export function signTone(value: number | string | null | undefined): string {
  const number = typeof value === "string" ? Number(value) : value;
  if (number == null || !Number.isFinite(number) || number === 0) return "text-slate-300";
  return number > 0 ? "text-[var(--up)]" : "text-[var(--down)]";
}

/** Formats a percentage with an explicit sign, such as +2.45% or -0.13%. */
export function formatSignedPct(value: number | string | null | undefined, digits = 2): string {
  const number = typeof value === "string" ? Number(value) : value;
  if (number == null || !Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}%`;
}
