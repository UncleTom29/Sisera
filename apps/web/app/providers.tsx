"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";

// Privy requires an appId of exactly 25 characters
const rawAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
const PRIVY_APP_ID = rawAppId && rawAppId.length === 25 ? rawAppId : "clsisera00000000000000000";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#06b6d4",
          showWalletLoginFirst: true,
          walletList: [
            "detected_wallets",
            "phantom",
            "solflare",
            "metamask",
            "coinbase_wallet",
            "rainbow",
          ],
        },
        loginMethods: ["wallet", "email", "google", "twitter"],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false,
        },
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyProvider>
  );
}
