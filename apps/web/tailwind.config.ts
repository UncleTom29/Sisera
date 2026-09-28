import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    // One corner language across the site and terminal: near-square, never pill-shaped panels.
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "2px",
      md: "2px",
      lg: "3px",
      xl: "3px",
      "2xl": "4px",
      full: "9999px",
    },
    extend: {
      colors: {
        // Brand: ink, bone, bronze, verdigris. Green and red are reserved for P&L.
        ink: { DEFAULT: "#0c141b", deep: "#080e14", raised: "#101b23" },
        panel: { DEFAULT: "#14202a", raised: "#192833" },
        line: { DEFAULT: "#2a3943", strong: "#43545c" },
        bone: { DEFAULT: "#f2f0e9", dim: "#d9d5c8" },
        bronze: {
          100: "#faecdc",
          200: "#f4d8b8",
          300: "#e9bd8c",
          400: "#d6a16d",
          500: "#b77d4e",
          600: "#8f5f38",
          700: "#5e3e25",
        },
        verdigris: { 300: "#a4d2c9", 400: "#78b9ad", 500: "#57978c" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: { insetline: "inset 0 0 0 1px rgba(148,163,184,.12)" },
    },
  },
  plugins: [],
} satisfies Config;
