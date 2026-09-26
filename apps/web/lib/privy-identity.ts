import type { User } from "@privy-io/react-auth";

export function getPrivyDisplayName(user: User | null | undefined): string {
  if (!user) return "Operator";
  return (
    user.google?.name?.trim() ||
    user.twitter?.name?.trim() ||
    user.twitter?.username?.trim() ||
    user.discord?.username?.trim() ||
    user.email?.address?.trim() ||
    user.google?.email?.trim() ||
    user.discord?.email?.trim() ||
    "Operator"
  );
}

export function getPrivySolanaAddress(user: User | null | undefined): string | null {
  const wallet = user?.linkedAccounts.find(
    (account) => account.type === "wallet" && account.chainType === "solana",
  );
  return wallet?.type === "wallet" ? wallet.address : null;
}
