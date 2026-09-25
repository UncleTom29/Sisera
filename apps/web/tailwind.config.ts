import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0c141b",
        panel: "#14202a",
        line: "#2a3943",
        cyan: { 200: "#f4d8b8", 300: "#e9bd8c", 400: "#d6a16d", 500: "#b77d4e" },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: { insetline: "inset 0 0 0 1px rgba(148,163,184,.12)" },
    },
  },
  plugins: [],
} satisfies Config;
