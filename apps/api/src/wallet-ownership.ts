import { PrivyClient } from "@privy-io/server-auth";
import type { ApiConfig } from "./config.js";

export type WalletChain = "ethereum" | "solana";

export function userOwnsWallet(
  linkedAccounts: Array<{ type: string; chainType?: string; address?: string }>,
  address: string,
  chain: WalletChain,
): boolean {
  return linkedAccounts.some(
    (account) =>
      account.type === "wallet" &&
      account.chainType === chain &&
      typeof account.address === "string" &&
      (chain === "ethereum"
        ? account.address.toLowerCase() === address.toLowerCase()
        : account.address === address),
  );
}

export function createWalletOwnershipChecker(config: ApiConfig) {
  const privy =
    config.PRIVY_APP_ID && config.PRIVY_APP_SECRET
      ? new PrivyClient(config.PRIVY_APP_ID, config.PRIVY_APP_SECRET)
      : null;

  return async (subject: string, address: string, chain: WalletChain): Promise<boolean> => {
    if (!privy || !subject.startsWith("privy:"))
      throw new Error("Wallet ownership verification is unavailable.");
    // Always read the current linked accounts so a recently unlinked wallet loses authority.
    const user = await privy.getUserById(subject.slice("privy:".length));
    return userOwnsWallet(user.linkedAccounts, address, chain);
  };
}
