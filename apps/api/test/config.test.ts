import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";

describe("local configuration", () => {
  it("accepts an unset optional Solana RPC URL from the example env file", () => {
    expect(readConfig({ SOLANA_RPC_URL: "" }).SOLANA_RPC_URL).toBeUndefined();
    expect(readConfig({}).SISERA_ALLOW_DEV_AUTH).toBe(false);
  });
});
