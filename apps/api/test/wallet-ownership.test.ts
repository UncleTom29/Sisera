import { describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { userOwnsWallet } from "../src/wallet-ownership.js";

const evmWallet = "0x1111111111111111111111111111111111111111";
const solanaWallet = "11111111111111111111111111111111";

describe("wallet ownership", () => {
  it("accepts only a linked wallet on the matching chain", () => {
    const accounts = [
      { type: "wallet", chainType: "ethereum", address: evmWallet },
      { type: "wallet", chainType: "solana", address: solanaWallet },
      {
        type: "smart_wallet",
        chainType: "ethereum",
        address: "0x2222222222222222222222222222222222222222",
      },
    ];
    expect(userOwnsWallet(accounts, evmWallet.toUpperCase().replace("0X", "0x"), "ethereum")).toBe(
      true,
    );
    expect(userOwnsWallet(accounts, solanaWallet, "solana")).toBe(true);
    expect(userOwnsWallet(accounts, solanaWallet, "ethereum")).toBe(false);
    expect(userOwnsWallet(accounts, "0x2222222222222222222222222222222222222222", "ethereum")).toBe(
      false,
    );
  });

  it("rejects live order preparation when wallet ownership is missing or unverified", async () => {
    const config = readConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      SISERA_ALLOW_DEV_AUTH: "true",
      SISERA_LIVE_SOLANA_ENABLED: "true",
    });
    const headers = { "x-sisera-dev-role": "trader", "x-sisera-dev-subject": "privy:test-user" };
    const payload = { wallet: solanaWallet, mint: solanaWallet, side: "buy", amount: "1000000" };
    const denied = await buildApi(config, { ownsWallet: async () => false });
    const deniedResponse = await denied.inject({
      method: "POST",
      url: "/v1/solana/orders/prepare",
      headers,
      payload,
    });
    expect(deniedResponse.statusCode).toBe(403);
    expect(deniedResponse.json().error).toBe("wallet_not_linked");
    await denied.close();

    const unavailable = await buildApi(config, {
      ownsWallet: async () => {
        throw new Error("Privy unavailable");
      },
    });
    const unavailableResponse = await unavailable.inject({
      method: "POST",
      url: "/v1/solana/orders/prepare",
      headers,
      payload,
    });
    expect(unavailableResponse.statusCode).toBe(503);
    expect(unavailableResponse.json().error).toBe("wallet_verification_unavailable");
    await unavailable.close();
  });

  it("checks both bridge wallets before requesting a provider quote", async () => {
    const checked: string[] = [];
    const app = await buildApi(
      readConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SISERA_ALLOW_DEV_AUTH: "true",
        DATABASE_URL: "postgres://example.test/sisera",
      }),
      {
        ownsWallet: async (_subject, address) => {
          checked.push(address);
          return address === evmWallet;
        },
      },
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/bridge/quote",
      headers: {
        "x-sisera-dev-role": "viewer",
        "x-sisera-dev-subject": "privy:test-user",
        "content-type": "application/json",
      },
      payload: {
        originChainId: 8453,
        destinationChainId: 792703809,
        user: evmWallet,
        recipient: solanaWallet,
        amountUsdc: "5",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("wallet_not_linked");
    expect(checked).toEqual([evmWallet, solanaWallet]);
    await app.close();
  });
});
