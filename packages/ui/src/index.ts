/**
 * Sisera design tokens + framework-agnostic primitives.
 * Framework-specific components (React Native / DOM) live in the apps and import these.
 */

export const colors = {
  bg: "#080b10",
  surface: "#0f141c",
  card: "#141b24",
  cardHover: "#1a2330",
  border: "#1f2937",
  borderSubtle: "#16202c",
  text: "#f3f4f6",
  textSecondary: "#9ca3af",
  muted: "#6b7280",
  accent: "#10b981",
  bid: "#10b981",
  ask: "#ef4444",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  purple: "#8b5cf6",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

export type Theme = {
  colors: typeof colors;
  spacing: typeof spacing;
  radius: typeof radius;
};

export const darkTheme: Theme = { colors, spacing, radius };

/** Format a Decimal-string amount for display (never rounds accounting values). */
export function formatAmount(value: string | number, places = 2): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/** Format currency with symbol prefix */
export function formatCurrency(value: string | number, symbol = "$", places = 2): string {
  const formatted = formatAmount(value, places);
  if (formatted === "—") return "—";
  return `${symbol}${formatted}`;
}

/** Format percentage with sign */
export function formatPct(value: string | number, places = 2): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(places)}%`;
}

/** Format compact number (1.2K, 3.4M, 1.5B) */
export function formatCompact(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

/** Data-quality badge text (stale/delayed states must be visible, spec §30). */
export type DataQuality = "LIVE" | "DELAYED" | "STALE" | "DEGRADED" | "UNAVAILABLE";

export function qualityLabel(q: DataQuality): string {
  switch (q) {
    case "LIVE":
      return "Live";
    case "DELAYED":
      return "Delayed";
    case "STALE":
      return "Stale";
    case "DEGRADED":
      return "Degraded";
    case "UNAVAILABLE":
      return "Unavailable";
  }
}

export function qualityBadgeColor(q: DataQuality): { bg: string; text: string } {
  switch (q) {
    case "LIVE":
      return { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981" };
    case "DELAYED":
      return { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b" };
    case "STALE":
    case "DEGRADED":
    case "UNAVAILABLE":
      return { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" };
  }
}
