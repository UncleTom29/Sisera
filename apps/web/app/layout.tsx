import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sisera — Multi-asset trading intelligence", template: "%s — Sisera" },
  description: "Research, trade, automate, and govern risk across digital and global markets.",
  metadataBase: new URL("https://sisera.trade"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
