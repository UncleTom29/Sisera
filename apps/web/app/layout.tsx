import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SiseraPrivyProvider } from "../components/privy-provider";
import { SessionRenewal } from "../components/session-renewal";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0c141b",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Sisera — Markets and Research",
    template: "%s — Sisera",
  },
  description:
    "Market data, paper trading, portfolio observations, and research tools across digital asset markets.",
  metadataBase: new URL("https://sisera.xyz"),
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.svg" }],
    shortcut: ["/icon.svg"],
  },
  keywords: [
    "Sisera",
    "Solana",
    "Tokenized Equities",
    "PreStocks",
    "Pyth",
    "Research Agents",
    "Trading Terminal",
    "Meteora DBC",
    "Clawpump",
    "Pre-IPO",
    "Solana Trading",
  ],
  authors: [{ name: "Sisera Trading Technologies" }],
  creator: "Sisera",
  publisher: "Sisera",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://sisera.xyz",
    siteName: "Sisera",
    title: "Sisera — Markets and Research",
    description:
      "Market data, paper trading, portfolio observations, and research tools across digital asset markets.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sisera — Markets and Research",
    description:
      "Market data, paper trading, portfolio observations, and research tools across digital asset markets.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SiseraPrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>
          <SessionRenewal />
          {children}
        </SiseraPrivyProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
