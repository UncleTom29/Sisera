import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sisera Terminal",
  description: "Intelligent multi-asset trading terminal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <div className="terminal-shell">
          <header className="topbar">
            <span className="brand">SISERA</span>
            <span className="mode-badge">PAPER</span>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
