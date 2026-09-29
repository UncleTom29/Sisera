import { PrivyClient } from "@privy-io/server-auth";
import { VersionedTransaction } from "@solana/web3.js";

/**
 * Signs Solana transactions for wallets whose owners delegated signing to Sisera through Privy
 * session signers. It is disabled unless an authorization key is configured and the operator has
 * enabled automatic live execution; every signature request is for a transaction that has
 * already passed Sisera's risk checks.
 */
export class DelegatedSigner {
  private readonly privy: PrivyClient | null;

  constructor(
    appId: string | undefined,
    appSecret: string | undefined,
    authorizationKey: string | undefined,
    private readonly enabled: boolean,
  ) {
    this.privy =
      enabled && appId && appSecret && authorizationKey
        ? new PrivyClient(appId, appSecret, {
            walletApi: { authorizationPrivateKey: authorizationKey },
          })
        : null;
  }

  get available(): boolean {
    return this.privy !== null;
  }

  /** True when the wallet belongs to the subject and its owner has delegated it. */
  async isDelegated(subject: string, wallet: string): Promise<boolean> {
    if (!this.privy) return false;
    const user = await this.privy.getUserByWalletAddress(wallet).catch(() => null);
    if (!user || `privy:${user.id}` !== subject) return false;
    return user.linkedAccounts.some(
      (account) =>
        account.type === "wallet" &&
        "address" in account &&
        account.address === wallet &&
        "delegated" in account &&
        account.delegated === true,
    );
  }

  async sign(subject: string, unsignedTransaction: string, wallet: string): Promise<string> {
    if (!this.privy) throw new Error("Delegated signing is not enabled");
    if (!(await this.isDelegated(subject, wallet)))
      throw new Error("Wallet is not delegated to Sisera");
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(unsignedTransaction, "base64"),
    );
    const { signedTransaction } = await this.privy.walletApi.solana.signTransaction({
      address: wallet,
      chainType: "solana",
      transaction,
    });
    return Buffer.from((signedTransaction as VersionedTransaction).serialize()).toString("base64");
  }
}
