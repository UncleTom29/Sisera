import { afterEach, describe, expect, it, vi } from "vitest";
import { HyperEvmWalletClient } from "../src/hyperevm.js";

afterEach(() => vi.unstubAllGlobals());
describe("HyperEVM wallet balances", () => {
  it("reads native HYPE and native USDC from the official RPC", async () => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      return Response.json({
        result: body.method === "eth_getBalance" ? "0xde0b6b3a7640000" : "0x2625a0",
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await new HyperEvmWalletClient().balances(
      "0x03508bb71268bba25ecacc8f620e01866650532c",
    );
    expect(result.hypeWei).toBe("1000000000000000000");
    expect(result.usdcRaw).toBe("2500000");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://rpc.hyperliquid.xyz/evm");
  });
});
