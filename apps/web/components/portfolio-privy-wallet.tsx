"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSolanaStandardWallets } from "@privy-io/react-auth/solana";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getPrivySolanaAddress } from "../lib/privy-identity";
import { useSiseraWallets } from "../lib/use-sisera-wallets";

export function PortfolioPrivyWallet({ mode = "suggest" }: { mode?: "suggest" | "linked" }) {
  const { ready, authenticated, user } = usePrivy();
  const { evmAddress, solanaAddress } = useSiseraWallets();
  const { wallets: solanaWallets } = useSolanaStandardWallets();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wallet = authenticated
    ? (solanaAddress ??
      getPrivySolanaAddress(user) ??
      solanaWallets.find((item) => item.accounts.length > 0)?.accounts[0]?.address)
    : null;
  const evmWallet = authenticated ? evmAddress : null;
  const query = searchParams.toString();

  useEffect(() => {
    if (!ready || !authenticated) return;
    const next = new URLSearchParams(query);
    if (mode === "linked") {
      if (wallet) next.set("solana", wallet);
      if (evmWallet) next.set("address", evmWallet);
    } else {
      if (wallet && !next.has("solana")) next.set("solana", wallet);
      if (evmWallet && !next.has("address")) next.set("address", evmWallet);
    }
    if (next.toString() === query) return;
    router.replace(`${pathname}?${next.toString()}`);
  }, [ready, authenticated, wallet, evmWallet, query, router, pathname, mode]);

  return null;
}
