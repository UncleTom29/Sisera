import type { PortfolioSnapshot } from "@sisera/domain";
import { describe, expect, it } from "vitest";
import {
  InMemoryLedger,
  calculateTca,
  reconcileBalances,
  stressPortfolio,
  valuePortfolio,
} from "../src/index.js";

const portfolio: PortfolioSnapshot = {
  portfolioId: "pf-1",
  baseCurrency: "USD",
  cash: { USD: "100000" },
  reconciledAt: "2026-01-01T00:00:00.000Z",
  source: "test",
  positions: [
    {
      instrumentId: "btc",
      side: "buy",
      quantity: "1",
      entryPrice: "50000",
      markPrice: "60000",
      contractMultiplier: "1",
      marginUsed: "6000",
      betaMap: { BTC: "1" },
    },
  ],
};

describe("legacy portfolio and accounting ports", () => {
  it("values and stresses a portfolio deterministically", () => {
    expect(valuePortfolio(portfolio).nav).toBe("110000");
    const stress = stressPortfolio(portfolio, { name: "BTC -20%", shocks: { BTC: "-0.2" } });
    expect(stress.totalPnl).toBe("-12000");
    expect(stress.projectedEquity).toBe("98000");
  });

  it("detects reconciliation differences", () => {
    expect(reconcileBalances({ USDC: "10" }, { USDC: "9.5" })).toEqual([
      { asset: "USDC", venue: "10", ledger: "9.5", difference: "0.5" },
    ]);
  });

  it("enforces double-entry balance per asset", () => {
    const ledger = new InMemoryLedger();
    expect(() =>
      ledger.post({
        id: "one",
        type: "transfer",
        referenceId: "r1",
        timestamp: "2026-01-01T00:00:00.000Z",
        postings: [
          { account: "cash", asset: "USD", amount: "-10" },
          { account: "counterparty", asset: "USD", amount: "10" },
        ],
      }),
    ).not.toThrow();
  });

  it("calculates implementation shortfall", () => {
    expect(
      calculateTca({
        side: "buy",
        arrivalPrice: "100",
        fillPrice: "101",
        quantity: "2",
        fees: "1",
      }),
    ).toEqual({ slippageBps: "100", implementationShortfall: "3" });
  });
});
