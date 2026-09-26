import { z } from "zod";
import { HYPEREVM_USDC } from "./bridge.js";

const Hex = z.string().regex(/^0x[a-fA-F0-9]+$/);
export class HyperEvmWalletClient {
  constructor(private readonly rpcUrl = "https://rpc.hyperliquid.xyz/evm") {}

  private async rpc(method: string, params: unknown[]): Promise<bigint> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(`HyperEVM RPC returned ${response.status}`);
    const result = z.object({ result: Hex }).parse(await response.json());
    return BigInt(result.result);
  }

  async balances(address: string) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Invalid EVM address");
    const calldata = `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
    const [hypeWei, usdcRaw] = await Promise.all([
      this.rpc("eth_getBalance", [address, "latest"]),
      this.rpc("eth_call", [{ to: HYPEREVM_USDC, data: calldata }, "latest"]),
    ]);
    return {
      address,
      hypeWei: hypeWei.toString(),
      usdcRaw: usdcRaw.toString(),
      usdcMint: HYPEREVM_USDC,
      source: "hyperevm-rpc" as const,
      fetchedAt: new Date().toISOString(),
    };
  }
}
