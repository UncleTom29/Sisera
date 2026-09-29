"use client";

import { type ConnectedWallet, useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useEffect, useRef } from "react";

type LinkedWallet = { address: string; chainType: string; walletClientType?: string };

/**
 * The Solana and EVM wallets Sisera uses for a signed-in user, whatever they signed in with.
 *
 * Social and email sign-ins get Privy embedded wallets on both chains. A wallet sign-in (Phantom,
 * MetaMask) brings a wallet on one chain only, so the other chain would otherwise be missing and
 * EVM features such as the bridge or Hyperliquid would ask the user to connect a second wallet.
 * This hook creates the missing embedded wallet once, so every user always has both.
 */
export function useSiseraWallets() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets: evmWallets, ready: evmReady } = useWallets();
  const { createWallet: createEvmWallet } = useCreateWallet();
  const {
    wallets: solanaWallets,
    ready: solanaReady,
    createWallet: createSolanaWallet,
  } = useSolanaWallets();
  const creating = useRef({ evm: false, solana: false });

  const linked = (user?.linkedAccounts ?? []).filter(
    (account): account is typeof account & LinkedWallet => account.type === "wallet",
  );
  const hasEmbedded = (chain: "ethereum" | "solana") =>
    linked.some((account) => account.chainType === chain && account.walletClientType === "privy");
  const linkedAddresses = new Set(linked.map((account) => account.address.toLowerCase()));

  // Prefer the embedded wallet (it can sign without extension prompts), then any linked wallet.
  const evm: ConnectedWallet | null =
    evmWallets.find((wallet) => wallet.walletClientType === "privy") ??
    evmWallets.find((wallet) => linkedAddresses.has(wallet.address.toLowerCase())) ??
    null;
  const solanaAddress =
    linked.find((account) => account.chainType === "solana" && account.walletClientType !== "privy")
      ?.address ??
    linked.find((account) => account.chainType === "solana")?.address ??
    solanaWallets[0]?.address ??
    null;
  const evmAddress =
    evm?.address ??
    linked.find(
      (account) => account.chainType === "ethereum" && account.walletClientType === "privy",
    )?.address ??
    null;

  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    if (evmReady && !hasEmbedded("ethereum") && !creating.current.evm) {
      creating.current.evm = true;
      void createEvmWallet().catch(() => {
        creating.current.evm = false;
      });
    }
    if (solanaReady && !hasEmbedded("solana") && !creating.current.solana) {
      creating.current.solana = true;
      void createSolanaWallet().catch(() => {
        creating.current.solana = false;
      });
    }
  });

  return {
    ready: ready && evmReady && solanaReady,
    authenticated,
    evm,
    evmAddress,
    solanaAddress,
  };
}
