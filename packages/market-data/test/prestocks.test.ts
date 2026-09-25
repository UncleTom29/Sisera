import { describe, expect, it, vi } from "vitest";
import { PreStocksProvider } from "../src/prestocks.js";

const payload = [
  {
    name: "Anduril PreStocks",
    symbol: "ANDURIL",
    contract_address: "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB",
    tokenPrice: 159.3,
    markPrice: 155.9,
    impliedValuation: 140_900_000_000,
    markValuation: 137_900_000_000,
    supply: 11_805,
  },
];

describe("PreStocksProvider", () => {
  it("normalizes the official mint and keeps missing source time explicit", async () => {
    const fetcher = vi.fn(async () => Response.json(payload));
    const provider = new PreStocksProvider("https://prestocks.test", fetcher);
    const first = await provider.list();
    const second = await provider.list();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first[0]?.instrument.mint).toBe(payload[0]?.contract_address);
    expect(first[0]?.instrument.type).toBe("pre_ipo_equity");
    expect(first[0]?.updatedAt).toBeNull();
    expect(Number(first[0]?.premiumDiscountPct)).toBeGreaterThan(2);
  });

  it("rejects an unverified mint or invalid price", async () => {
    const provider = new PreStocksProvider("https://prestocks.test", async () =>
      Response.json([{ ...payload[0], contract_address: "not-a-mint", markPrice: 0 }]),
    );
    await expect(provider.list()).rejects.toThrow();
  });
});
