"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSolanaStandardWallets } from "@privy-io/react-auth/solana";
import { useCallback } from "react";
import { getPrivySolanaAddress } from "./privy-identity";

const toBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));

/**
 * The account's Solana wallet and a signer for transactions Sisera prepared server-side. Signing
 * always happens in the user's wallet; Sisera only ever receives the signed bytes.
 */
export function useSolanaSigner() {
  const { wallets } = useSolanaStandardWallets();
  const { user } = usePrivy();
  const linked = getPrivySolanaAddress(user);
  const wallet =
    wallets.find((item) => item.accounts.some((account) => account.address === linked)) ??
    wallets.find((item) => item.accounts.length > 0);
  const account = wallet?.accounts.find((item) => item.address === linked) ?? wallet?.accounts[0];

  const signAll = useCallback(
    async (transactions: readonly string[]) => {
      if (!wallet || !account) throw new Error("Connect a Solana wallet first.");
      const signer = wallet.features["solana:signTransaction"];
      if (!signer)
        throw new Error("This wallet cannot sign transactions. Choose another Solana wallet.");
      const signed: string[] = [];
      for (const transaction of transactions) {
        const [result] = await signer.signTransaction({
          account,
          transaction: toBytes(transaction),
          chain: "solana:mainnet",
        });
        if (!result) throw new Error("The wallet did not sign the transaction.");
        signed.push(toBase64(result.signedTransaction));
      }
      return signed;
    },
    [wallet, account],
  );

  return { address: account?.address ?? null, ready: Boolean(wallet && account), signAll };
}
