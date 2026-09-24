import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { PrivyAuthButton } from "./components/PrivyAuthButton";

export const metadata: Metadata = {
  title: "Sisera — Institutional Multi-Asset Trading Terminal",
  description: "High-performance institutional trading OS and quantitative execution terminal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-shell">
            <header className="header-topbar">
              <div className="header-left">
                <Link href="/" className="brand-title">
                  <span className="brand-dot" />
                  SISERA
                </Link>

                <nav className="nav-group">
                  <Link href="/" className="nav-tab">
                    Terminal
                  </Link>
                  <Link href="/portfolio" className="nav-tab">
                    Portfolio & Risk
                  </Link>
                  <Link href="/agents" className="nav-tab">
                    Agents Studio
                  </Link>
                  <Link href="/predictions" className="nav-tab">
                    Predictions
                  </Link>
                  <Link href="/analytics" className="nav-tab">
                    TCA & Ledger
                  </Link>
                </nav>
              </div>

              <div className="header-right">
                <div className="status-indicator">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bid)" }} />
                  <span>14ms</span>
                </div>

                <div className="portfolio-badge font-mono">
                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>PORTFOLIO:</span>
                  <select
                    defaultValue="pf_1"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-primary)",
                      fontSize: 11,
                      fontWeight: 600,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="pf_1" style={{ background: "#0b0f17" }}>Main ($104,885)</option>
                    <option value="pf_agents" style={{ background: "#0b0f17" }}>Alpha Desk ($50,000)</option>
                    <option value="pf_macro" style={{ background: "#0b0f17" }}>Macro Fund ($250,000)</option>
                  </select>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    color: "var(--text-secondary)",
                    fontFamily: "monospace",
                  }}
                >
                  Paper Execution
                </div>

                <PrivyAuthButton />
              </div>
            </header>

            <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
