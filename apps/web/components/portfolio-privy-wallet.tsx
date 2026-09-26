"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getPrivySolanaAddress } from "../lib/privy-identity";

export function PortfolioPrivyWallet() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const wallet = authenticated ? getPrivySolanaAddress(user) : null;
  const query = searchParams.toString();

  useEffect(() => {
    if (!ready || !wallet || searchParams.has("solana")) return;
    const next = new URLSearchParams(query);
    next.set("solana", wallet);
    router.replace(`/portfolio?${next.toString()}`);
  }, [ready, wallet, query, router, searchParams]);

  return null;
}
