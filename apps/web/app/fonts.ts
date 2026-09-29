import localFont from "next/font/local";

// Mona Sans (GitHub's open-source typeface) carries headlines and interface text.
export const sansFont = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "../public/fonts/mona-sans-latin-400-normal.woff2", weight: "400" },
    { path: "../public/fonts/mona-sans-latin-500-normal.woff2", weight: "500" },
    { path: "../public/fonts/mona-sans-latin-600-normal.woff2", weight: "600" },
    { path: "../public/fonts/mona-sans-latin-700-normal.woff2", weight: "700" },
    { path: "../public/fonts/mona-sans-latin-800-normal.woff2", weight: "800" },
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
