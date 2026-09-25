import { z } from "zod";

const SolanaAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
const RpcEnvelope = z.object({ result: z.unknown().optional(), error: z.unknown().optional() });
const Balance = z.object({ value: z.number().int().nonnegative() });
const TokenAccounts = z.object({
  value: z.array(
    z.object({
      account: z.object({
        data: z.object({
          parsed: z.object({
            info: z.object({
              tokenAmount: z.object({
                amount: z.string().regex(/^\d+$/),
                decimals: z.number().int().nonnegative(),
              }),
            }),
          }),
        }),
      }),
    }),
  ),
});
const TokenSupply = z.object({ value: z.object({ decimals: z.number().int().nonnegative() }) });
const Assets = z.object({
  items: z
    .array(
      z.object({
        id: SolanaAddress,
        interface: z.string(),
        content: z
          .object({
            metadata: z
              .object({ name: z.string().optional(), symbol: z.string().optional() })
              .optional(),
          })
          .optional(),
        token_info: z
          .object({ balance: z.number().nonnegative(), decimals: z.number().int().nonnegative() })
          .optional(),
      }),
    )
    .default([]),
});

export class HeliusClient {
  constructor(
    private readonly rpcUrl: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  private async rpc(method: string, params: unknown[]) {
    const response = await this.fetcher(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Helius RPC returned ${response.status}`);
    const envelope = RpcEnvelope.parse(await response.json());
    if (envelope.error || envelope.result === undefined) throw new Error(`Helius ${method} failed`);
    return envelope.result;
  }

  async getSolLamports(address: string) {
    const balance = Balance.parse(
      await this.rpc("getBalance", [SolanaAddress.parse(address), { commitment: "confirmed" }]),
    );
    return String(balance.value);
  }

  async getTokenBalance(address: string, mint: string) {
    const accounts = TokenAccounts.parse(
      await this.rpc("getTokenAccountsByOwner", [
        SolanaAddress.parse(address),
        { mint: SolanaAddress.parse(mint) },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
    );
    const decimals =
      accounts.value[0]?.account.data.parsed.info.tokenAmount.decimals ??
      TokenSupply.parse(await this.rpc("getTokenSupply", [mint])).value.decimals;
    const rawBalance = accounts.value.reduce(
      (total, item) => total + BigInt(item.account.data.parsed.info.tokenAmount.amount),
      0n,
    );
    return { rawBalance: rawBalance.toString(), decimals };
  }

  async getWallet(address: string) {
    const owner = SolanaAddress.parse(address);
    const [balancePayload, assetsPayload] = await Promise.all([
      this.rpc("getBalance", [owner, { commitment: "confirmed" }]),
      this.rpc("getAssetsByOwner", [
        {
          ownerAddress: owner,
          page: 1,
          limit: 1000,
          displayOptions: { showFungible: true, showNativeBalance: false, showZeroBalance: false },
        },
      ]),
    ]);
    const balance = Balance.parse(balancePayload);
    const assets = Assets.parse(assetsPayload);
    return {
      address: owner,
      solLamports: String(balance.value),
      holdings: assets.items
        .filter((item) => item.interface === "FungibleToken" || item.interface === "FungibleAsset")
        .filter((item) => item.token_info)
        .map((item) => ({
          mint: item.id,
          symbol: item.content?.metadata?.symbol ?? null,
          name: item.content?.metadata?.name ?? null,
          rawBalance: String(item.token_info?.balance ?? 0),
          decimals: item.token_info?.decimals ?? 0,
        })),
      fetchedAt: new Date().toISOString(),
      source: "helius-das",
      reconciled: false,
    } as const;
  }
}
