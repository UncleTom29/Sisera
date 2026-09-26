import { describe, expect, it } from "vitest";
import { settleMarketPaperOrder } from "../src/market-paper.js";

const starting = () => ({ cashUsd: "10000", spotHoldings: {}, perpPositions: {} });

describe("market paper settlement", () => {
  it("debits a spot buy and refuses an uncovered sale", () => {
    const first = settleMarketPaperOrder(starting(), {
      venue: "binance",
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      side: "buy",
      quantity: "0.01",
      fillPrice: "50000",
    });
    expect(first.state.cashUsd).toBe("9499.5");
    expect(first.state.spotHoldings.BTC).toBe("0.01");
    expect(() =>
      settleMarketPaperOrder(first.state, {
        venue: "binance",
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        side: "sell",
        quantity: "0.02",
        fillPrice: "50000",
      }),
    ).toThrow("Insufficient paper spot holdings");
  });

  it("marks a closing perp trade to realized cash and enforces 1x exposure", () => {
    const opened = settleMarketPaperOrder(starting(), {
      venue: "hyperliquid",
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      side: "buy",
      quantity: "0.02",
      fillPrice: "50000",
    });
    const closed = settleMarketPaperOrder(opened.state, {
      venue: "hyperliquid",
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      side: "sell",
      quantity: "0.02",
      fillPrice: "51000",
    });
    expect(closed.state.cashUsd).toBe("10018.99");
    expect(closed.state.perpPositions.BTCUSDT).toBeUndefined();
  });
});
