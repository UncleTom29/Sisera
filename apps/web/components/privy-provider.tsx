"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export function SiseraPrivyProvider({
  appId,
  children,
}: { appId: string | undefined; children: ReactNode }) {
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "apple", "email", "wallet", "passkey"],
        appearance: { theme: "dark", walletChainType: "solana-only" },
        embeddedWallets: { solana: { createOnLogin: "users-without-wallets" } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
