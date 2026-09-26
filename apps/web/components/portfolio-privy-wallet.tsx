"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getPrivySolanaAddress } from "../lib/privy-identity";

export function PortfolioPrivyWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wallet = authenticated ? getPrivySolanaAddress(user) : null;
  const evmWallet = authenticated ? wallets[0]?.address : null;
  const query = searchParams.toString();

  useEffect(() => {
    if (!ready) return;
    const next = new URLSearchParams(query);
    if (wallet && !next.has("solana")) next.set("solana", wallet);
    if (evmWallet && !next.has("address")) next.set("address", evmWallet);
    if (next.toString() === query) return;
    router.replace(`${pathname}?${next.toString()}`);
  }, [ready, wallet, evmWallet, query, router, pathname]);

  return null;
}
