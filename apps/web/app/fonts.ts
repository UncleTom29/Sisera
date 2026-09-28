import localFont from "next/font/local";

export const displayFont = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../public/fonts/newsreader-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/newsreader-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/newsreader-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
});

export const sansFont = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "../public/fonts/schibsted-grotesk-latin-400-normal.woff2", weight: "400" },
    { path: "../public/fonts/schibsted-grotesk-latin-500-normal.woff2", weight: "500" },
    { path: "../public/fonts/schibsted-grotesk-latin-600-normal.woff2", weight: "600" },
    { path: "../public/fonts/schibsted-grotesk-latin-700-normal.woff2", weight: "700" },
  ],
});

export const monoFont = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "../public/fonts/commit-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../public/fonts/commit-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../public/fonts/commit-mono-latin-700-normal.woff2", weight: "700" },
  ],
});
