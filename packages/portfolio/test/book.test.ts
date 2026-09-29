import { describe, expect, it } from "vitest";
import {
  type Fill,
  STANDARD_SCENARIOS,
  buildPositions,
  runScenario,
  simulateTrade,
  valuePositions,
} from "../src/index.js";

const fill = (overrides: Partial<Fill>): Fill => ({
  id: crypto.randomUUID(),
  mode: "paper",
  book: "manual",
  venue: "solana",
  assetClass: "public_equity",
  instrumentKey: "AAPLx",
  symbol: "AAPLx",
  side: "buy",
  quantity: "10",
  priceUsd: "100",
  feeUsd: "0",
  occurredAt: "2026-09-01T00:00:00Z",
  ...overrides,
});

describe("position book", () => {
  it("tracks average cost, realized P&L and flips", () => {
    const [position] = buildPositions([
      fill({}),
      fill({ quantity: "10", priceUsd: "120", occurredAt: "2026-09-02T00:00:00Z" }),
      fill({
        side: "sell",
        quantity: "5",
        priceUsd: "130",
        feeUsd: "1",
        occurredAt: "2026-09-03T00:00:00Z",
      }),
    ]);
    expect(position?.quantity).toBe("15");
    expect(position?.averageCostUsd).toBe("110");
    expect(position?.realizedPnlUsd).toBe("99");
    const [flipped] = buildPositions([
      fill({ assetClass: "perpetual" }),
      fill({
        assetClass: "perpetual",
        side: "sell",
        quantity: "15",
        priceUsd: "90",
        occurredAt: "2026-09-02T00:00:00Z",
      }),
    ]);
    expect(flipped?.quantity).toBe("-5");
    expect(flipped?.averageCostUsd).toBe("90");
    expect(flipped?.realizedPnlUsd).toBe("-100");
  });

  it("values, groups duplicate exposure and simulates trades", () => {
    const positions = buildPositions([
      fill({}),
      fill({
        instrumentKey: "CLAWAAPL",
        symbol: "CLAWAAPL",
        assetClass: "agent_token",
        quantity: "100",
        priceUsd: "1",
      }),
    ]);
    const marks = new Map([
      [
        "AAPLx",
        {
          priceUsd: "110",
          source: "test",
          observedAt: null,
          underlying: "AAPL",
          liquidityUsd: 100_000,
        },
      ],
      [
        "CLAWAAPL",
        {
          priceUsd: "2",
          source: "test",
          observedAt: null,
          underlying: "AAPL",
          liquidityUsd: 1_000,
        },
      ],
    ]);
    const { positions: valued, summary } = valuePositions(positions, marks, 1_000);
    expect(summary.navUsd).toBe(2_300);
    expect(summary.unrealizedPnlUsd).toBe(200);
    expect(summary.duplicateExposures[0]?.symbols.sort()).toEqual(["AAPLx", "CLAWAAPL"]);
    expect(summary.liquidityRisk[0]?.symbol).toBe("CLAWAAPL");
    const impact = simulateTrade(valued, summary, {
      instrumentKey: "AAPLx",
      symbol: "AAPLx",
      assetClass: "public_equity",
      side: "buy",
      notionalUsd: 500,
      underlying: "AAPL",
      liquidityUsd: 100_000,
    });
    expect(impact.blocked).toBe(true);
    expect(impact.duplicateOf).toEqual(["CLAWAAPL"]);
    const crash = runScenario(
      valued,
      summary,
      STANDARD_SCENARIOS.find(
        (s) => s.id === "liquidity_freeze",
      ) as (typeof STANDARD_SCENARIOS)[number],
    );
    expect(crash.pnlUsd).toBeLessThan(0);
  });
});
