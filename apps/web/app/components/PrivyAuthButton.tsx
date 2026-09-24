"use client";

import { useState } from "react";
import { usePrivy, useWallets, useSolanaWallets } from "@privy-io/react-auth";

export function PrivyAuthButton() {
  const { ready, authenticated, user, login, logout, linkWallet, linkGoogle, linkTwitter, linkEmail } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!ready) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", opacity: 0.5 }} />
        INITIALIZING...
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <button
        onClick={() => login()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 12px",
          background: "linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)",
          border: "1px solid rgba(6, 182, 212, 0.4)",
          borderRadius: 4,
          color: "#38bdf8",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.02em",
          cursor: "pointer",
          transition: "all 0.15s ease",
          boxShadow: "0 0 12px rgba(6, 182, 212, 0.1)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#38bdf8";
          e.currentTarget.style.boxShadow = "0 0 16px rgba(6, 182, 212, 0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(6, 182, 212, 0.4)";
          e.currentTarget.style.boxShadow = "0 0 12px rgba(6, 182, 212, 0.1)";
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
        SIGN IN / CONNECT
      </button>
    );
  }

  // Determine user display identity
  const evmWallet = wallets?.[0];
  const solWallet = solanaWallets?.[0];
  const emailAccount = user.email?.address;
  const googleAccount = user.google?.email;
  const twitterAccount = user.twitter?.username;

  let displayLabel = "TRADER";
  let chainType = "EVM";

  if (solWallet?.address) {
    displayLabel = `${solWallet.address.slice(0, 4)}...${solWallet.address.slice(-4)}`;
    chainType = "SOLANA";
  } else if (evmWallet?.address) {
    displayLabel = `${evmWallet.address.slice(0, 6)}...${evmWallet.address.slice(-4)}`;
    chainType = "EVM";
  } else if (twitterAccount) {
    displayLabel = `@${twitterAccount}`;
    chainType = "X";
  } else if (googleAccount) {
    displayLabel = googleAccount.split("@")[0];
    chainType = "GOOGLE";
  } else if (emailAccount) {
    displayLabel = emailAccount.split("@")[0];
    chainType = "EMAIL";
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "4px 10px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 11,
          fontFamily: "monospace",
          color: "var(--text-primary)",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 6px rgba(16, 185, 129, 0.6)",
          }}
        />
        <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 2, background: "rgba(6, 182, 212, 0.15)", color: "#06b6d4", fontWeight: 700 }}>
          {chainType}
        </span>
        <span style={{ fontWeight: 600 }}>{displayLabel}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 9 }}>▼</span>
      </button>

      {dropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 250,
            background: "#0d131f",
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            padding: 8,
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(6, 182, 212, 0.1)",
            zIndex: 100,
            fontFamily: "monospace",
          }}
        >
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>AUTHENTICATED PRIVY USER</div>
            <div style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 700, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.id}
            </div>
          </div>

          <div style={{ padding: "4px 8px", display: "flex", flexDirection: "column", gap: 5, fontSize: 10 }}>
            {solWallet && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <span>SOL WALLET:</span>
                <span style={{ color: "#10b981" }}>{solWallet.address.slice(0, 6)}...{solWallet.address.slice(-4)}</span>
              </div>
            )}
            {evmWallet && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <span>EVM WALLET:</span>
                <span style={{ color: "#38bdf8" }}>{evmWallet.address.slice(0, 6)}...{evmWallet.address.slice(-4)}</span>
              </div>
            )}
            {twitterAccount && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <span>X / TWITTER:</span>
                <span style={{ color: "var(--text-primary)" }}>@{twitterAccount}</span>
              </div>
            )}
            {googleAccount && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <span>GOOGLE:</span>
                <span style={{ color: "var(--text-primary)" }}>{googleAccount}</span>
              </div>
            )}
            {emailAccount && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <span>EMAIL:</span>
                <span style={{ color: "var(--text-primary)" }}>{emailAccount}</span>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <button
              onClick={() => { linkWallet(); setDropdownOpen(false); }}
              style={{
                textAlign: "left",
                padding: "5px 8px",
                background: "transparent",
                border: "none",
                borderRadius: 3,
                fontSize: 10,
                color: "#06b6d4",
                cursor: "pointer",
              }}
            >
              + Link Additional Wallet
            </button>
            {!twitterAccount && (
              <button
                onClick={() => { linkTwitter(); setDropdownOpen(false); }}
                style={{
                  textAlign: "left",
                  padding: "5px 8px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 3,
                  fontSize: 10,
                  color: "#38bdf8",
                  cursor: "pointer",
                }}
              >
                + Link X (Twitter) Account
              </button>
            )}
            <button
              onClick={() => { logout(); setDropdownOpen(false); }}
              style={{
                textAlign: "left",
                padding: "6px 8px",
                marginTop: 4,
                background: "rgba(244, 63, 94, 0.1)",
                border: "1px solid rgba(244, 63, 94, 0.2)",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                color: "#f43f5e",
                cursor: "pointer",
              }}
            >
              DISCONNECT & SIGN OUT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
