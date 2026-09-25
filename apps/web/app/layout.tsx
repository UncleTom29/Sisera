import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SiseraPrivyProvider } from "../components/privy-provider";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0c141b",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Sisera — Trading & Intelligence Terminal on Solana",
    template: "%s — Sisera",
  },
  description:
    "Full-stack trading and intelligence terminal for tokenized equities, PreStocks private markets, stock-linked assets, and persistent autonomous trading agents on Solana.",
  metadataBase: new URL("https://sisera.trade"),
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
    "Autonomous Agents",
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
    url: "https://sisera.trade",
    siteName: "Sisera",
    title: "Sisera — Trading & Intelligence Terminal on Solana",
    description:
      "Tokenized equities, PreStocks private markets, Pyth fair-value reference, and persistent trading agents on Solana.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sisera — Trading & Intelligence Terminal on Solana",
    description:
      "Full-stack trading and intelligence terminal for tokenized equities, PreStocks, and autonomous agents on Solana.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SiseraPrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>
          {children}
        </SiseraPrivyProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
