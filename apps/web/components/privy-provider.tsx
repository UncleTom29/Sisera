"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

const DEFAULT_PRIVY_APP_ID = "cmuhawmmr00xa0bjwxxjqdocd";

export function SiseraPrivyProvider({
  appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || DEFAULT_PRIVY_APP_ID,
  children,
}: { appId?: string | undefined; children: ReactNode }) {
  const activeAppId = appId || DEFAULT_PRIVY_APP_ID;
  return (
    <PrivyProvider
      appId={activeAppId}
      config={{
        loginMethods: ["email", "google", "twitter", "discord", "apple", "wallet", "passkey"],
        appearance: {
          theme: "dark",
          accentColor: "#67e8f9",
          logo: "/icon.svg",
          walletChainType: "ethereum-and-solana",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
          solana: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
