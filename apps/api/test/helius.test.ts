import { describe, expect, it, vi } from "vitest";
import { HeliusClient } from "../src/helius.js";

const wallet = "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB";
describe("HeliusClient", () => {
  it("sums exact token balances without rounding large raw amounts", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body)) as { method: string };
      if (body.method === "getTokenAccountsByOwner")
        return Response.json({
          result: {
            value: [
              {
                account: {
                  data: {
                    parsed: { info: { tokenAmount: { amount: "9007199254740993", decimals: 6 } } },
                  },
                },
              },
              {
                account: {
                  data: { parsed: { info: { tokenAmount: { amount: "7", decimals: 6 } } } },
                },
              },
            ],
          },
        });
      return Response.json({ result: { value: { decimals: 6 } } });
    });
    const client = new HeliusClient("https://helius.test", fetcher);
    expect(await client.getTokenBalance(wallet, wallet)).toEqual({
      rawBalance: "9007199254741000",
      decimals: 6,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reads native balance and indexed fungible holdings without granting trading authority", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body)) as { method: string };
      return Response.json({
        result:
          body.method === "getBalance"
            ? { value: 1_250_000_000 }
            : {
                items: [
                  {
                    id: wallet,
                    interface: "FungibleToken",
                    content: { metadata: { name: "Anduril", symbol: "ANDURIL" } },
                    token_info: { balance: 1000, decimals: 6 },
                  },
                ],
              },
      });
    });
    const account = await new HeliusClient("https://helius.test", fetcher).getWallet(wallet);
    expect(account.solLamports).toBe("1250000000");
    expect(account.holdings[0]?.mint).toBe(wallet);
    expect(account.reconciled).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back to standard Solana token accounts when DAS is unavailable", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body)) as { method: string };
      if (body.method === "getBalance") return Response.json({ result: { value: 500_000_000 } });
      if (body.method === "getAssetsByOwner") return Response.json({ error: { code: -32601 } });
      return Response.json({
        result: {
          value: [
            {
              account: {
                data: {
                  parsed: {
                    info: {
                      mint: wallet,
                      tokenAmount: { amount: "9007199254740993", decimals: 6 },
                    },
                  },
                },
              },
            },
          ],
        },
      });
    });
    const account = await new HeliusClient("https://public-rpc.test", fetcher).getWallet(wallet);
    expect(account.source).toBe("solana-rpc");
    expect(account.solLamports).toBe("500000000");
    expect(account.holdings[0]?.rawBalance).toBe("18014398509481986");
  });
});
