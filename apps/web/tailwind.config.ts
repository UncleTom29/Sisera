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
        ink: "#05080d",
        panel: "#0a0f16",
        line: "#1d2733",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Berkeley Mono", "SFMono-Regular", "Cascadia Code", "ui-monospace", "monospace"],
      },
      boxShadow: { insetline: "inset 0 0 0 1px rgba(148,163,184,.12)" },
    },
  },
  plugins: [],
} satisfies Config;
