"use client";

import { useSiseraWallets } from "../lib/use-sisera-wallets";

/** Ensures every signed-in user has both a Solana and an EVM wallet as soon as they arrive. */
export function WalletProvisioner() {
  useSiseraWallets();
  return null;
}
