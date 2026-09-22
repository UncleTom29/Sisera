/**
 * Sisera design tokens + framework-agnostic primitives.
 * Framework-specific components (React Native / DOM) live in the apps and import these.
 */

export const colors = {
  bg: "#0a0e14",
  surface: "#11161f",
  border: "#1e2632",
  text: "#e6edf3",
  muted: "#8b95a5",
  accent: "#00f29d",
  danger: "#ff5470",
  warning: "#ffb800",
  info: "#4aa8ff",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
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
